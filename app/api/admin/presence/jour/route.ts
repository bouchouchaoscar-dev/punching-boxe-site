import { NextResponse } from "next/server";
import { getSupabaseAdmin, isSupabaseConfigured, exigerData } from "@/lib/supabase";
import { isAdminRequest } from "@/lib/admin-guard";
import { presenceActif, coursOuverts, partiesParis, comparerBlocsPresence } from "@/lib/presence";
import { chargerPlanning } from "@/lib/presence-server";
import { construireLignesAdmin, categoriesDeLigne, CATEGORIES, type PresenceRow, type Categorie } from "@/lib/presence-admin";
import { disciplineLabel, publicLabel, formatHeure } from "@/lib/planning";

export const runtime = "nodejs";

const ISO = /^\d{4}-\d{2}-\d{2}$/;
const compteursVides = (): Record<Categorie, number> =>
  Object.fromEntries(CATEGORIES.map((c) => [c, 0])) as Record<Categorie, number>;

// GET /api/admin/presence/jour?date=YYYY-MM-DD — vue « Aujourd'hui » (admin).
export async function GET(request: Request) {
  if (!presenceActif()) return NextResponse.json({ error: "Module désactivé." }, { status: 404 });
  if (!isAdminRequest(request)) return NextResponse.json({ error: "Non autorisé." }, { status: 401 });
  if (!isSupabaseConfigured()) return NextResponse.json({ date: "", cours: [] });

  const now = new Date();
  const param = new URL(request.url).searchParams.get("date");
  const date = param && ISO.test(param) ? param : partiesParis(now).iso;
  const dow = (() => {
    const [y, m, d] = date.split("-").map(Number);
    const j = new Date(Date.UTC(y, m - 1, d)).getUTCDay();
    return j === 0 ? 7 : j;
  })();

  const supabase = getSupabaseAdmin();
  const { cours, periodes } = await chargerPlanning(supabase);
  const coursDuJour = cours.filter((c) => c.actif && c.jour_semaine === dow);

  // Fenêtre « ouvert maintenant » seulement si la date demandée est aujourd'hui.
  const estAujourdhui = date === partiesParis(now).iso;
  const ouvertsIds = new Set(
    estAujourdhui ? coursOuverts(now, { cours, periodes }).map((o) => o.cours.id) : [],
  );

  const disciplineByCours = new Map(cours.map((c) => [c.id, c.discipline]));
  const presRows = exigerData(
    await supabase
      .from("presences")
      .select("id, cours_id, date_seance, dossier_id, essai_id, source, created_at, created_by")
      .eq("date_seance", date),
    "présence jour: présences",
  );
  const lignes = await construireLignesAdmin(supabase, (presRows ?? []) as PresenceRow[], disciplineByCours);

  const blocs = coursDuJour
    .map((c) => {
      const l = lignes.filter((x) => x.coursId === c.id);
      const compteurs = compteursVides();
      for (const x of l) for (const cat of categoriesDeLigne(x)) compteurs[cat]++;
      return {
        id: c.id,
        libelle: c.libelle,
        discipline: disciplineLabel(c.discipline),
        public: publicLabel(c.type_adherent),
        horaire: `${formatHeure(c.heure_debut)} – ${formatHeure(c.heure_fin)}`,
        heureDebut: c.heure_debut,
        heureFin: c.heure_fin,
        salle: c.salle,
        dateISO: date,
        ouvert: ouvertsIds.has(c.id),
        nbPresents: l.length,
        compteurs,
        lignes: l,
      };
    })
    // Ordre partagé admin ↔ coach : en cours → à venir → passés (puis horaire).
    .sort((a, b) => comparerBlocsPresence(a, b, estAujourdhui ? partiesParis(now).minutes : -1));

  return NextResponse.json({ date, cours: blocs }, { headers: { "Cache-Control": "no-store" } });
}
