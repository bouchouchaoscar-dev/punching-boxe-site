import { NextResponse } from "next/server";
import { getSupabaseAdmin, isSupabaseConfigured } from "@/lib/supabase";
import { hasRole } from "@/lib/admin-guard";
import { presenceActif, partiesParis, construireLignesCoachPresence } from "@/lib/presence";
import { chargerPlanning } from "@/lib/presence-server";
import { statutTrombi } from "@/lib/paiement";
import { photoDataUri } from "@/lib/trombi-server";
import { disciplineLabel, publicLabel, formatHeure } from "@/lib/planning";

export const runtime = "nodejs";
const ISO = /^\d{4}-\d{2}-\d{2}$/;

function heureParis(iso: string): string {
  const m = partiesParis(new Date(iso)).minutes;
  return `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
}

// GET /api/coach/presence?date= — vue « Aujourd'hui » COACH, LECTURE SEULE,
// liste blanche stricte (aucun email/téléphone/montant ; photo en data-URI).
export async function GET(request: Request) {
  if (!presenceActif()) return NextResponse.json({ error: "Module désactivé." }, { status: 404 });
  if (!hasRole(request, ["coach", "admin"])) return NextResponse.json({ error: "Accès refusé." }, { status: 401 });
  if (!isSupabaseConfigured()) return NextResponse.json({ date: "", cours: [] });

  const now = new Date();
  const param = new URL(request.url).searchParams.get("date");
  const date = param && ISO.test(param) ? param : partiesParis(now).iso;
  const [y, m, d] = date.split("-").map(Number);
  const dow = (() => {
    const j = new Date(Date.UTC(y, m - 1, d)).getUTCDay();
    return j === 0 ? 7 : j;
  })();

  const supabase = getSupabaseAdmin();
  const { cours } = await chargerPlanning(supabase);
  const coursDuJour = cours.filter((c) => c.actif && c.jour_semaine === dow);

  const { data: presRows } = await supabase
    .from("presences")
    .select("id, cours_id, date_seance, dossier_id, essai_id, created_at")
    .eq("date_seance", date);
  const pres = presRows ?? [];

  const dossierIds = [...new Set(pres.map((p) => p.dossier_id).filter(Boolean))] as string[];
  const essaiIds = [...new Set(pres.map((p) => p.essai_id).filter(Boolean))] as string[];
  const [{ data: adh }, { data: ess }] = await Promise.all([
    dossierIds.length
      ? supabase.from("adherents").select("id, prenom, nom, photo_url, statut_paiement, mode_paiement, nb_echeances, echeances_payees, engage_at, annule_at").in("id", dossierIds)
      : Promise.resolve({ data: [] as Record<string, unknown>[] }),
    essaiIds.length
      ? supabase.from("essais").select("id, prenom, nom").in("id", essaiIds)
      : Promise.resolve({ data: [] as Record<string, unknown>[] }),
  ]);
  const adhById = new Map((adh ?? []).map((a) => [a.id as string, a]));
  const essById = new Map((ess ?? []).map((e) => [e.id as string, e]));
  // Photos en data-URI (jamais d'URL de stockage exposée au coach).
  const photoById = new Map<string, string | null>();
  await Promise.all(
    dossierIds.map(async (id) => photoById.set(id, await photoDataUri((adhById.get(id)?.photo_url as string) ?? null))),
  );

  const blocs = coursDuJour
    .map((c) => {
      const rows = pres
        .filter((p) => p.cours_id === c.id)
        .map((p) => {
          if (p.dossier_id) {
            const a = adhById.get(p.dossier_id);
            if (!a) return null;
            return {
              prenom: a.prenom, nom: a.nom, essai: false,
              couleur: statutTrombi(a as Parameters<typeof statutTrombi>[0]).couleur,
              heure: heureParis(p.created_at), photo: photoById.get(p.dossier_id) ?? null,
            };
          }
          const e = essById.get(p.essai_id as string);
          if (!e) return null;
          return { prenom: e.prenom, nom: e.nom, essai: true, couleur: null, heure: heureParis(p.created_at), photo: null };
        })
        .filter(Boolean) as Parameters<typeof construireLignesCoachPresence>[0];
      const lignes = construireLignesCoachPresence(rows);
      return {
        id: c.id,
        libelle: c.libelle,
        discipline: disciplineLabel(c.discipline),
        public: publicLabel(c.type_adherent),
        horaire: `${formatHeure(c.heure_debut)} – ${formatHeure(c.heure_fin)}`,
        heureDebut: c.heure_debut,
        salle: c.salle,
        nbPresents: lignes.length,
        lignes,
      };
    })
    .sort((a, b) => (a.heureDebut ?? "").localeCompare(b.heureDebut ?? ""));

  return NextResponse.json({ date, cours: blocs }, { headers: { "Cache-Control": "no-store" } });
}
