// SOURCE UNIQUE du STATUT d'une séance d'essai. PUR, sans I/O. Le statut et la date
// d'inscription ne sont JAMAIS stockés : ils sont DÉRIVÉS à la lecture depuis le
// dossier rattaché (converti_dossier_id) et les paiements réels (encaissement).
// Leçon : un statut stocké finit par mentir (ex. état d'échec figé après régularisation).
import { CONFIG_CLUB } from "./config-club";

export type StatutEssaiCode =
  | "inscrit" // argent réellement encaissé sur le dossier rattaché
  | "dossier_en_cours" // dossier rattaché, créé, non annulé, aucun encaissement
  | "en_attente" // aucun dossier rattaché, essai récent (< seuil)
  | "a_rappeler" // aucun dossier rattaché, essai >= seuil, pas encore rappelé
  | "rappele"; // l'admin a marqué l'essai comme rappelé (sans inscription depuis)

export type EssaiPourStatut = {
  date_seance: string; // 1re séance de la personne (la PLUS ANCIENNE) — ISO yyyy-mm-dd
  converti_dossier_id: string | null;
  rappele_at: string | null;
};
export type DossierPourStatut = {
  annule_at?: string | null;
  statut_paiement?: string | null;
  echeances_payees?: number | null;
} | null;
export type PaiementPourStatut = {
  statut: string | null;
  date_paiement: string | null;
};

export type StatutEssai = {
  code: StatutEssaiCode;
  inscrit: boolean;
  dateInscription: string | null; // ISO (date du 1er encaissement réel), sinon null
  delaiJours: number | null; // dateInscription − 1re séance, en jours entiers
};

const MS_JOUR = 86_400_000;
const isoJour = (d: Date) => d.toISOString().slice(0, 10);
// Nombre de jours entiers entre deux dates calendaires (ISO yyyy-mm-dd).
function joursEntre(aISO: string, bISO: string): number {
  const a = Date.parse(`${aISO}T00:00:00Z`);
  const b = Date.parse(`${bISO}T00:00:00Z`);
  if (Number.isNaN(a) || Number.isNaN(b)) return 0;
  return Math.round((b - a) / MS_JOUR);
}

// ENCAISSEMENT RÉEL = au moins une ligne paiements « payée » (1re échéance carte
// OU espèces confirmées = ligne 'paye'). Dérivé des lignes réelles ; filet sur le
// statut dérivé du dossier si les lignes ne sont pas fournies.
export function encaissementReel(
  dossier: DossierPourStatut,
  paiements: PaiementPourStatut[] | null | undefined,
): { paye: boolean; date: string | null } {
  const payes = (paiements ?? []).filter((p) => p.statut === "paye");
  if (payes.length > 0) {
    const date = payes
      .map((p) => (p.date_paiement ? p.date_paiement.slice(0, 10) : null))
      .filter((x): x is string => !!x)
      .sort()[0] ?? null;
    return { paye: true, date };
  }
  if (dossier && (dossier.statut_paiement === "paye" || dossier.statut_paiement === "confirme_especes" || (dossier.echeances_payees ?? 0) >= 1)) {
    return { paye: true, date: null };
  }
  return { paye: false, date: null };
}

/**
 * Statut d'un essai (et date/délai d'inscription dérivés).
 *  - `essai.date_seance` doit être la PLUS ANCIENNE séance de la personne (le délai
 *    se calcule par rapport à elle). L'appelant regroupe les essais par personne.
 *  - `dossier` = dossier rattaché (ou null). Un dossier ANNULÉ est traité comme
 *    « non rattaché » (ni dossier en cours, ni inscrit).
 *  - `paiements` = lignes paiements du dossier rattaché (pour l'encaissement réel).
 */
export function statutEssai(
  essai: EssaiPourStatut,
  dossier: DossierPourStatut,
  paiements: PaiementPourStatut[] | null | undefined,
  maintenant: Date,
  config: { conversionSeuilJours?: number } = CONFIG_CLUB.modules.presence,
): StatutEssai {
  const dossierActif = !!dossier && !dossier.annule_at;
  if (dossierActif) {
    const enc = encaissementReel(dossier, paiements);
    if (enc.paye) {
      const delai = enc.date ? joursEntre(essai.date_seance, enc.date) : null;
      return { code: "inscrit", inscrit: true, dateInscription: enc.date, delaiJours: delai };
    }
    return { code: "dossier_en_cours", inscrit: false, dateInscription: null, delaiJours: null };
  }
  // Aucun dossier (actif) rattaché.
  if (essai.rappele_at) return { code: "rappele", inscrit: false, dateInscription: null, delaiJours: null };
  const seuil = config.conversionSeuilJours ?? 14;
  const age = joursEntre(essai.date_seance, isoJour(maintenant));
  return age >= seuil
    ? { code: "a_rappeler", inscrit: false, dateInscription: null, delaiJours: null }
    : { code: "en_attente", inscrit: false, dateInscription: null, delaiJours: null };
}

// Libellé d'une provenance (code → label de la config), 'autre' → texte libre.
export function provenanceLabel(
  code: string | null | undefined,
  autre: string | null | undefined,
  provenances: { code: string; label: string }[] = CONFIG_CLUB.modules.presence.provenances,
): string {
  if (!code) return "";
  if (code === "autre") return autre?.trim() || "Autre";
  return provenances.find((p) => p.code === code)?.label ?? code;
}

// Code de provenance valide ? (null/'' accepté car facultatif.)
export function provenanceValide(
  code: string | null | undefined,
  provenances: { code: string; label: string }[] = CONFIG_CLUB.modules.presence.provenances,
): boolean {
  if (!code) return true;
  return provenances.some((p) => p.code === code);
}
