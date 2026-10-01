import { NextResponse } from "next/server";
import { getSupabaseAdmin, isSupabaseConfigured, exigerData } from "@/lib/supabase";
import { hasRole } from "@/lib/admin-guard";
import { presenceActif, partiesParis, construireLignesCoachPresence, coursOuverts, comparerBlocsPresence } from "@/lib/presence";
import { chargerPlanning } from "@/lib/presence-server";
import { classerDossier, categoriesDeLigne, CATEGORIES, heureParis, type LigneAdmin, type Categorie } from "@/lib/presence-admin";
import { photoDataUri } from "@/lib/trombi-server";
import { disciplineLabel, publicLabel, formatHeure } from "@/lib/planning";

export const runtime = "nodejs";
const ISO = /^\d{4}-\d{2}-\d{2}$/;
const compteursVides = (): Record<Categorie, number> =>
  Object.fromEntries(CATEGORIES.map((c) => [c, 0])) as Record<Categorie, number>;

// GET /api/coach/presence?date= — vue COACH, LECTURE SEULE, liste blanche stricte
// (aucun email/téléphone/montant/date de naissance ; photo en data-URI). Mêmes
// filtres/compteurs et libellés de statut que l'admin.
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
  const { cours, periodes } = await chargerPlanning(supabase);
  const coursDuJour = cours.filter((c) => c.actif && c.jour_semaine === dow);
  const disciplineByCours = new Map(cours.map((c) => [c.id, c.discipline]));

  // Détection « en cours » IDENTIQUE à l'admin (même fenêtre coursOuverts), et
  // seulement si la date demandée est aujourd'hui.
  const estAujourdhui = date === partiesParis(now).iso;
  const ouvertsIds = new Set(
    estAujourdhui ? coursOuverts(now, { cours, periodes }).map((o) => o.cours.id) : [],
  );

  const presRows = exigerData(
    await supabase
      .from("presences")
      .select("id, cours_id, date_seance, dossier_id, essai_id, created_at")
      .eq("date_seance", date),
    "coach présence: présences",
  );
  const pres = presRows ?? [];

  const dossierIds = [...new Set(pres.map((p) => p.dossier_id).filter(Boolean))] as string[];
  const essaiIds = [...new Set(pres.map((p) => p.essai_id).filter(Boolean))] as string[];
  const [{ data: adh }, { data: ess }] = await Promise.all([
    dossierIds.length
      ? supabase.from("adherents").select("id, prenom, nom, photo_url, statut_paiement, mode_paiement, nb_echeances, echeances_payees, engage_at, annule_at, fiche_valide, reglement_valide, photo_valide, certificat_valide, certificat_medical_url, package, option_prepa_physique").in("id", dossierIds)
      : Promise.resolve({ data: [] as Record<string, unknown>[] }),
    essaiIds.length ? supabase.from("essais").select("id, prenom, nom, date_seance").in("id", essaiIds) : Promise.resolve({ data: [] as Record<string, unknown>[] }),
  ]);
  const adhById = new Map((adh ?? []).map((a) => [a.id as string, a]));
  const essById = new Map((ess ?? []).map((e) => [e.id as string, e]));
  const photoById = new Map<string, string | null>();
  await Promise.all(dossierIds.map(async (id) => photoById.set(id, await photoDataUri((adhById.get(id)?.photo_url as string) ?? null))));

  const blocs = coursDuJour
    .map((c) => {
      // Lignes riches (pour compteurs) puis whitelist stricte pour la réponse.
      const rich = pres
        .filter((p) => p.cours_id === c.id)
        .map((p): (LigneAdmin & { photoData: string | null }) | null => {
          if (p.dossier_id) {
            const a = adhById.get(p.dossier_id);
            if (!a) return null;
            const cl = classerDossier(a as Parameters<typeof classerDossier>[0], disciplineByCours.get(c.id) ?? null);
            return {
              presenceId: p.id, coursId: c.id, dateSeance: p.date_seance, kind: "dossier",
              prenom: String(a.prenom ?? ""), nom: String(a.nom ?? ""), photo: null,
              couleur: cl.couleur, statutLabel: cl.statutLabel, cat: cl.cat, incomplet: cl.incomplet,
              essai: false, essaiDejaUtilise: false, horsFormule: cl.horsFormule,
              heure: heureParis(p.created_at), source: "", photoData: photoById.get(p.dossier_id) ?? null,
            };
          }
          const e = essById.get(p.essai_id as string);
          if (!e) return null;
          return {
            presenceId: p.id, coursId: c.id, dateSeance: p.date_seance, kind: "essai",
            prenom: String(e.prenom ?? ""), nom: String(e.nom ?? ""), photo: null,
            couleur: null, statutLabel: "Séance d'essai", cat: null, incomplet: false,
            essai: true, essaiDejaUtilise: (e.date_seance as string) !== p.date_seance, horsFormule: false,
            heure: heureParis(p.created_at), source: "", photoData: null,
          };
        })
        .filter(Boolean) as (LigneAdmin & { photoData: string | null })[];

      const compteurs = compteursVides();
      for (const x of rich) for (const cat of categoriesDeLigne(x)) compteurs[cat]++;

      const lignes = construireLignesCoachPresence(
        rich.map((x) => ({ ...x, photo: x.photoData })),
      );
      return {
        id: c.id, libelle: c.libelle, discipline: disciplineLabel(c.discipline),
        public: publicLabel(c.type_adherent),
        horaire: `${formatHeure(c.heure_debut)} – ${formatHeure(c.heure_fin)}`,
        heureDebut: c.heure_debut, heureFin: c.heure_fin, salle: c.salle,
        ouvert: ouvertsIds.has(c.id), nbPresents: rich.length, compteurs, lignes,
      };
    })
    // Même ordre que l'admin : en cours → à venir → passés (puis horaire).
    .sort((a, b) => comparerBlocsPresence(a, b, estAujourdhui ? partiesParis(now).minutes : -1));

  return NextResponse.json({ date, cours: blocs }, { headers: { "Cache-Control": "no-store" } });
}
