// Construction des lignes de présence côté ADMIN + classification partagée
// (statut trombi = SOURCE UNIQUE, complétude dossier, hors-formule). Serveur.
import type { SupabaseClient } from "@supabase/supabase-js";
import { statutTrombi } from "./paiement";
import { evaluerDossier } from "./dossier";
import { signerUrls } from "./storage-url";
import { partiesParis } from "./presence";
import { adherentDansDiscipline } from "./planning";

export type PresenceRow = {
  id: string;
  cours_id: string;
  date_seance: string;
  dossier_id: string | null;
  essai_id: string | null;
  source: string;
  created_at: string;
  created_by: string | null;
};

// Catégories de FILTRE (peuvent se chevaucher : une personne peut être rouge ET
// incomplète ET hors formule).
export type Categorie =
  | "regle"
  | "especes"
  | "non_finalise"
  | "incomplet"
  | "essai"
  | "essai_utilise"
  | "hors_formule";

export const CATEGORIES: Categorie[] = [
  "regle", "especes", "non_finalise", "incomplet", "essai", "essai_utilise", "hors_formule",
];

export type LigneAdmin = {
  presenceId: string;
  coursId: string;
  dateSeance: string;
  kind: "dossier" | "essai";
  dossierId?: string;
  essaiId?: string;
  prenom: string;
  nom: string;
  photo: string | null; // URL signée (admin)
  couleur: "vert" | "orange" | "rouge" | null; // pastille trombi (null pour essai)
  statutLabel: string; // libellé paiement, ou « Séance d'essai »
  cat: "regle" | "especes" | "non_finalise" | null; // catégorie paiement (null pour essai)
  incomplet: boolean;
  essai: boolean;
  essaiDejaUtilise: boolean;
  horsFormule: boolean;
  heure: string; // HH:MM (Europe/Paris)
  source: string;
  // Détails essai (admin uniquement) :
  email?: string | null;
  relance1?: string | null;
  relance2?: string | null;
  converti?: boolean;
};

export function heureParis(iso: string): string {
  const m = partiesParis(new Date(iso)).minutes;
  return `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
}

// Classification PURE d'un dossier présent (couleur/label paiement + badges).
// Réutilisée par l'admin ET le coach → aucune divergence de règle.
export function classerDossier(
  a: {
    statut_paiement: string | null; mode_paiement: string | null;
    nb_echeances: number | null; echeances_payees: number | null;
    engage_at: string | null; annule_at: string | null;
    fiche_valide?: boolean | null; reglement_valide?: boolean | null;
    photo_valide?: boolean | null; certificat_valide?: boolean | null; certificat_medical_url?: string | null;
    package?: string | null; option_prepa_physique?: boolean | null;
  },
  discipline: string | null,
): { couleur: "vert" | "orange" | "rouge"; statutLabel: string; cat: "regle" | "especes" | "non_finalise"; incomplet: boolean; horsFormule: boolean } {
  const st = statutTrombi(a as Parameters<typeof statutTrombi>[0]);
  const cat: "regle" | "especes" | "non_finalise" =
    st.couleur === "vert" ? "regle" : st.code === "attente_especes" ? "especes" : "non_finalise";
  const incomplet = evaluerDossier(a as Parameters<typeof evaluerDossier>[0]).statut === "incomplet";
  // Hors formule : la formule du dossier ne couvre pas la discipline du cours
  // (réutilise la règle de ciblage « prévenir d'un cours »). Sans discipline → jamais.
  const horsFormule = !!discipline && !adherentDansDiscipline(a.package ?? null, a.option_prepa_physique === true, discipline);
  return { couleur: st.couleur, statutLabel: st.label, cat, incomplet, horsFormule };
}

// Catégories d'une ligne (pour compteurs/filtres, chevauchement assumé).
export function categoriesDeLigne(l: LigneAdmin): Categorie[] {
  const out: Categorie[] = [];
  if (l.essai) {
    out.push("essai");
    if (l.essaiDejaUtilise) out.push("essai_utilise");
    return out;
  }
  if (l.cat) out.push(l.cat);
  if (l.incomplet) out.push("incomplet");
  if (l.horsFormule) out.push("hors_formule");
  return out;
}

// Tri : situations à traiter d'abord, réglés en dernier.
function rang(l: LigneAdmin): number {
  if (l.essaiDejaUtilise || l.horsFormule) return 0;
  if (l.cat === "non_finalise") return 1;
  if (l.cat === "especes") return 2;
  if (l.incomplet) return 3;
  if (l.essai) return 4;
  return 5; // réglé
}

const CHAMPS_ADH =
  "id, prenom, nom, photo_url, statut_paiement, mode_paiement, nb_echeances, echeances_payees, engage_at, annule_at, fiche_valide, reglement_valide, photo_valide, certificat_valide, certificat_medical_url, package, option_prepa_physique";

/** Lignes admin (triées) à partir des présences d'une/des séance(s).
 *  `disciplineByCours` : discipline de chaque cours (pour le hors-formule). */
export async function construireLignesAdmin(
  supabase: SupabaseClient,
  presences: PresenceRow[],
  disciplineByCours: Map<string, string | null>,
): Promise<LigneAdmin[]> {
  const dossierIds = [...new Set(presences.map((p) => p.dossier_id).filter(Boolean))] as string[];
  const essaiIds = [...new Set(presences.map((p) => p.essai_id).filter(Boolean))] as string[];

  const [{ data: adh }, { data: ess }] = await Promise.all([
    dossierIds.length ? supabase.from("adherents").select(CHAMPS_ADH).in("id", dossierIds) : Promise.resolve({ data: [] as Record<string, unknown>[] }),
    essaiIds.length ? supabase.from("essais").select("id, prenom, nom, email, date_naissance, date_seance, relance_1_at, relance_2_at, converti_dossier_id, desinscrit").in("id", essaiIds) : Promise.resolve({ data: [] as Record<string, unknown>[] }),
  ]);
  const adhById = new Map((adh ?? []).map((a) => [a.id as string, a]));
  const essById = new Map((ess ?? []).map((e) => [e.id as string, e]));

  const photos = await signerUrls(dossierIds.map((id) => (adhById.get(id)?.photo_url as string) ?? null));
  const photoById = new Map(dossierIds.map((id, i) => [id, photos[i]]));

  const lignes: LigneAdmin[] = [];
  for (const p of presences) {
    if (p.dossier_id) {
      const a = adhById.get(p.dossier_id);
      if (!a) continue;
      const c = classerDossier(a as Parameters<typeof classerDossier>[0], disciplineByCours.get(p.cours_id) ?? null);
      lignes.push({
        presenceId: p.id, coursId: p.cours_id, dateSeance: p.date_seance, kind: "dossier",
        dossierId: p.dossier_id, prenom: String(a.prenom ?? ""), nom: String(a.nom ?? ""),
        photo: photoById.get(p.dossier_id) ?? null, couleur: c.couleur, statutLabel: c.statutLabel,
        cat: c.cat, incomplet: c.incomplet, essai: false, essaiDejaUtilise: false, horsFormule: c.horsFormule,
        heure: heureParis(p.created_at), source: p.source,
      });
    } else if (p.essai_id) {
      const e = essById.get(p.essai_id);
      if (!e) continue;
      // Présence sur un essai d'une AUTRE date que la séance → essai déjà utilisé
      // (rattaché à un essai existant, cf. quota essaisGratuits).
      const dejaUtilise = (e.date_seance as string) !== p.date_seance;
      lignes.push({
        presenceId: p.id, coursId: p.cours_id, dateSeance: p.date_seance, kind: "essai",
        essaiId: p.essai_id, prenom: String(e.prenom ?? ""), nom: String(e.nom ?? ""),
        photo: null, couleur: null, statutLabel: "Séance d'essai", cat: null, incomplet: false,
        essai: true, essaiDejaUtilise: dejaUtilise, horsFormule: false,
        heure: heureParis(p.created_at), source: p.source,
        email: (e.email as string) ?? null, relance1: (e.relance_1_at as string) ?? null,
        relance2: (e.relance_2_at as string) ?? null, converti: !!e.converti_dossier_id,
      });
    }
  }
  lignes.sort((a, b) => rang(a) - rang(b) || a.heure.localeCompare(b.heure));
  return lignes;
}
