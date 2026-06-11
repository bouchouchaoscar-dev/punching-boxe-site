import type { Adherent } from "./types";
import { estEngage } from "./engagement";

// ============================================================
// Foyer familial — décompte pour la remise (groupés ∪ rattachés)
// Fonctions PURES (testables, aucun import serveur).
// ============================================================

// Champs minimaux nécessaires au décompte d'un dossier.
export type DossierFoyer = Pick<
  Adherent,
  "statut_paiement" | "echeances_payees" | "mode_paiement" | "annule_at"
>;

/**
 * Un dossier COMPTE dans le foyer (déclenche / bénéficie de la remise) si :
 *  - il n'est PAS fermé (annule_at null), ET
 *  - il est ENGAGÉ (carte payée / fractionné 1re échéance / espèces confirmées)
 *    OU c'est une inscription ESPÈCES finalisée en attente de confirmation admin.
 *
 * Exclut donc : les dossiers FERMÉS (annule_at) et les PANIERS ABANDONNÉS
 * (dossier carte resté en_attente sans engagement). Inclut les espèces en attente
 * (engagement réel : la personne a finalisé son inscription en choisissant espèces).
 */
export function compteDansFoyer(a: DossierFoyer): boolean {
  if (a.annule_at) return false;
  if (estEngage(a)) return true;
  return a.mode_paiement === "especes" && a.statut_paiement === "en_attente";
}

/** Nombre de membres du foyer qui comptent, parmi un ensemble de dossiers. */
export function compterFoyer(dossiers: DossierFoyer[]): number {
  return dossiers.filter(compteDansFoyer).length;
}

/** Rang du NOUVEAU dossier = membres déjà comptés + 1. */
export function rangNouveau(dossiers: DossierFoyer[]): number {
  return compterFoyer(dossiers) + 1;
}

// ---- Résolution / fusion des foyers (rattachement de comptes séparés) ----

// État d'un membre cité (résolu en base via nom+prénom+naissance).
export type FoyerSource =
  | { etat: "introuvable" } // aucun dossier
  | { etat: "ambigu" } // plusieurs foyers distincts correspondent
  | { etat: "ok"; foyerId: string | null; titulaireId: string };

export type ResolutionFoyer =
  | { ok: false; raison: "introuvable" | "ambigu" }
  | {
      ok: true;
      cible: string; // foyer_id final du foyer unifié
      foyersAReecrire: string[]; // foyer_ids existants à fusionner vers `cible`
      titulairesAtagger: string[]; // titulaires SANS foyer à passer sous `cible`
    };

/**
 * Décide le foyer_id cible (fusion union-find aplatie) à partir du foyer du
 * NOUVEL inscrit (`proprietaire`) et des membres cités résolus. `newId` est un
 * uuid fourni par l'appelant (pureté : pas de génération interne).
 * - membre introuvable / ambigu → échec bloquant.
 * - un foyer réel existe déjà → on le réutilise (déterministe : le plus petit).
 * - sinon → on crée le foyer `newId`.
 */
export function resoudreFoyerCible(
  proprietaire: { titulaireId: string; foyerId: string | null },
  membres: FoyerSource[],
  newId: string,
): ResolutionFoyer {
  if (membres.some((m) => m.etat === "introuvable"))
    return { ok: false, raison: "introuvable" };
  if (membres.some((m) => m.etat === "ambigu"))
    return { ok: false, raison: "ambigu" };

  const oks = membres.filter(
    (m): m is Extract<FoyerSource, { etat: "ok" }> => m.etat === "ok",
  );

  const foyersReels = new Set<string>();
  if (proprietaire.foyerId) foyersReels.add(proprietaire.foyerId);
  for (const m of oks) if (m.foyerId) foyersReels.add(m.foyerId);

  const titulairesSansFoyer = new Set<string>();
  if (!proprietaire.foyerId) titulairesSansFoyer.add(proprietaire.titulaireId);
  for (const m of oks) if (!m.foyerId) titulairesSansFoyer.add(m.titulaireId);

  // Cible : un foyer réel existant (le plus petit, déterministe), sinon newId.
  const cible = foyersReels.size > 0 ? [...foyersReels].sort()[0] : newId;
  const foyersAReecrire = [...foyersReels].filter((f) => f !== cible).sort();
  const titulairesAtagger = [...titulairesSansFoyer].sort();

  return { ok: true, cible, foyersAReecrire, titulairesAtagger };
}
