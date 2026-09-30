// Construction des lignes de présence côté ADMIN (statut trombi = source unique,
// complétude dossier, photo signée). Serveur uniquement.
import type { SupabaseClient } from "@supabase/supabase-js";
import { statutTrombi } from "./paiement";
import { evaluerDossier } from "./dossier";
import { signerUrls } from "./storage-url";
import { partiesParis } from "./presence";

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

// Situation regroupée pour les compteurs (5 familles avec « essai »).
export type Situation = "regle" | "especes" | "non_finalise" | "incomplet" | "essai";

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
  statutLabel: string | null;
  situation: Situation;
  heure: string; // HH:MM (Europe/Paris)
  source: string;
  essai: boolean;
  // Détails essai (admin uniquement) :
  email?: string | null;
  relance1?: string | null;
  relance2?: string | null;
  converti?: boolean;
};

function heureParis(iso: string): string {
  const m = partiesParis(new Date(iso)).minutes;
  return `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
}

// Situation d'un dossier : paiement non finalisé > espèces en attente >
// dossier incomplet > réglé. Le paiement prime (action argent), puis les docs.
function situationDossier(a: {
  statut_paiement: string | null; mode_paiement: string | null;
  nb_echeances: number | null; echeances_payees: number | null;
  engage_at: string | null; annule_at: string | null;
  fiche_valide?: boolean | null; reglement_valide?: boolean | null;
  photo_valide?: boolean | null; certificat_valide?: boolean | null; certificat_medical_url?: string | null;
}): { situation: Exclude<Situation, "essai">; couleur: "vert" | "orange" | "rouge"; label: string } {
  const st = statutTrombi(a as Parameters<typeof statutTrombi>[0]);
  const docs = evaluerDossier(a as Parameters<typeof evaluerDossier>[0]);
  let situation: Exclude<Situation, "essai">;
  if (st.code === "a_finaliser" || st.code === "echec") situation = "non_finalise";
  else if (st.code === "attente_especes") situation = "especes";
  else if (docs.statut === "incomplet") situation = "incomplet";
  else situation = "regle";
  return { situation, couleur: st.couleur, label: st.label };
}

// Tri : situations à traiter d'abord (non finalisé, espèces, incomplet, essai) puis réglés.
const RANG: Record<Situation, number> = { non_finalise: 0, especes: 1, incomplet: 2, essai: 3, regle: 4 };

const CHAMPS_ADH =
  "id, prenom, nom, photo_url, statut_paiement, mode_paiement, nb_echeances, echeances_payees, engage_at, annule_at, fiche_valide, reglement_valide, photo_valide, certificat_valide, certificat_medical_url";

/** Construit les lignes admin (triées) à partir des présences d'une/des séance(s). */
export async function construireLignesAdmin(
  supabase: SupabaseClient,
  presences: PresenceRow[],
): Promise<LigneAdmin[]> {
  const dossierIds = [...new Set(presences.map((p) => p.dossier_id).filter(Boolean))] as string[];
  const essaiIds = [...new Set(presences.map((p) => p.essai_id).filter(Boolean))] as string[];

  const [{ data: adh }, { data: ess }] = await Promise.all([
    dossierIds.length ? supabase.from("adherents").select(CHAMPS_ADH).in("id", dossierIds) : Promise.resolve({ data: [] as Record<string, unknown>[] }),
    essaiIds.length ? supabase.from("essais").select("id, prenom, nom, email, date_naissance, relance_1_at, relance_2_at, converti_dossier_id, desinscrit").in("id", essaiIds) : Promise.resolve({ data: [] as Record<string, unknown>[] }),
  ]);
  const adhById = new Map((adh ?? []).map((a) => [a.id as string, a]));
  const essById = new Map((ess ?? []).map((e) => [e.id as string, e]));

  // Photos signées (batch, aligné).
  const photos = await signerUrls(dossierIds.map((id) => (adhById.get(id)?.photo_url as string) ?? null));
  const photoById = new Map(dossierIds.map((id, i) => [id, photos[i]]));

  const lignes: LigneAdmin[] = [];
  for (const p of presences) {
    if (p.dossier_id) {
      const a = adhById.get(p.dossier_id);
      if (!a) continue;
      const s = situationDossier(a as Parameters<typeof situationDossier>[0]);
      lignes.push({
        presenceId: p.id, coursId: p.cours_id, dateSeance: p.date_seance, kind: "dossier",
        dossierId: p.dossier_id, prenom: String(a.prenom ?? ""), nom: String(a.nom ?? ""),
        photo: photoById.get(p.dossier_id) ?? null, couleur: s.couleur, statutLabel: s.label,
        situation: s.situation, heure: heureParis(p.created_at), source: p.source, essai: false,
      });
    } else if (p.essai_id) {
      const e = essById.get(p.essai_id);
      if (!e) continue;
      lignes.push({
        presenceId: p.id, coursId: p.cours_id, dateSeance: p.date_seance, kind: "essai",
        essaiId: p.essai_id, prenom: String(e.prenom ?? ""), nom: String(e.nom ?? ""),
        photo: null, couleur: null, statutLabel: "Séance d'essai", situation: "essai",
        heure: heureParis(p.created_at), source: p.source, essai: true,
        email: (e.email as string) ?? null, relance1: (e.relance_1_at as string) ?? null,
        relance2: (e.relance_2_at as string) ?? null, converti: !!e.converti_dossier_id,
      });
    }
  }
  lignes.sort((a, b) => RANG[a.situation] - RANG[b.situation] || a.heure.localeCompare(b.heure));
  return lignes;
}
