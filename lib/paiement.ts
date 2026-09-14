import type { Adherent } from "./types";
import type { ModePaiement } from "./pricing";

// Payé (pastille VERTE) = mêmes états que le vert de StatutBadge/PaiementStatut :
// paiement soldé (carte payée / fractionné N/N → statut_paiement passe à "paye")
// ou espèces confirmées. Tout le reste (en attente, engagé partiel, échec) = orange.
// Source unique du booléen "payé" pour le trombinoscope (vue + PDF).
export function estPaiementSolde(a: Pick<Adherent, "statut_paiement">): boolean {
  return (
    a.statut_paiement === "paye" || a.statut_paiement === "confirme_especes"
  );
}

// INCOHÉRENCE « payé sans encaissement » : un dossier CARTE COMPTANT (1x) marqué
// statut_paiement='paye' MAIS dont aucun encaissement réel n'est reflété
// (echeances_payees = 0). Après le durcissement de markAdherentPaid, un vrai 1x
// encaissé a echeances_payees=1 → jamais incohérent ; seul un résidu (ou un futur
// bug) tombe ici. Les espèces (confirme_especes, mode 'especes') et le fractionné
// (nb>1, dont l'état vient déjà de echeances_payees) sont exclus. Sert de garde
// « argent » commune : ni vert, ni facture acquittée tant que l'encaissement 1x
// n'est pas prouvé — on montre alors un état ORANGE « à vérifier ».
export function paiementIncoherent(
  a: Pick<
    Adherent,
    "statut_paiement" | "mode_paiement" | "nb_echeances" | "echeances_payees"
  >,
): boolean {
  const nb = a.nb_echeances || 1;
  const carte = (a.mode_paiement ?? "").startsWith("stripe");
  return (
    a.statut_paiement === "paye" &&
    carte &&
    nb <= 1 &&
    (a.echeances_payees ?? 0) === 0
  );
}

// SOURCE UNIQUE de la population « paiement carte jamais finalisé » : dossier
// carte (stripe*), inscription faite, mais paiement jamais mené au bout — AUCUNE
// tentative de débit. À distinguer de l'échec (echec_paiement = carte présentée
// puis refusée) et des espèces en attente (mode especes). Réutilisé aux 4
// endroits (filtre liste, filtre trombi, statutTrombi, carte dashboard) — ne
// jamais recopier la condition.
export function estPaiementAFinaliser(
  a: Pick<
    Adherent,
    "mode_paiement" | "statut_paiement" | "engage_at" | "echeances_payees" | "annule_at"
  >,
): boolean {
  return (
    (a.mode_paiement ?? "").startsWith("stripe") &&
    a.statut_paiement === "en_attente" &&
    a.engage_at == null &&
    (a.echeances_payees ?? 0) === 0 &&
    a.annule_at == null
  );
}

// SOURCE UNIQUE de « visible au trombinoscope » : inscription signée + photo
// présente, hors dossiers fermés — PAYÉ OU NON. Élargit la population du trombi
// (le coach voit toutes les têtes + le statut en couleur, dont « à finaliser »).
// REMPLACE estActifCompte AUX 2 SEULS POINTS TROMBI (Trombinoscope.tsx admin +
// trombi-server.ts coach/PDF). Ne touche PAS estActifCompte/estEngage, partagés
// par dashboard/stats/mailing/foyers. Choix produit : on N'EXIGE PAS photo_valide
// (photo montrée même non revue par l'admin), cohérent avec l'existant.
export function estVisibleTrombi(
  a: Pick<Adherent, "annule_at" | "photo_url" | "fiche_signee_at">,
): boolean {
  return !a.annule_at && !!a.photo_url && !!a.fiche_signee_at;
}

// Libellé COURT du mode de paiement (stripe* → "Carte"). Préparé pour usage
// éventuel ; la vignette essentielle n'affiche pas le mode.
export function modeLabelCourt(mode: ModePaiement): string {
  return mode === "especes" ? "Espèces" : "Carte";
}

// ---- Statut PRÉCIS pour le trombinoscope (source unique vue + PDF) ----
// Un fractionné qui avance normalement est VERT (sain). Seul un vrai échec de
// prélèvement (statut_paiement = 'echec_paiement', posé par le cron/confirm)
// est ROUGE. L'attente espèces (non encore encaissée) est ORANGE.
export type TrombiStatutCode =
  | "paye_carte"
  | "paye_especes"
  | "fractionne" // carte fractionnée en cours (sain)
  | "attente_especes"
  | "a_finaliser" // carte, inscription faite, paiement jamais mené au bout (aucune tentative)
  | "a_verifier" // carte 1x 'paye' mais aucun encaissement réel reflété (alerte)
  | "echec";

export type TrombiStatut = {
  code: TrombiStatutCode;
  couleur: "vert" | "orange" | "rouge";
  label: string;
};

export function statutTrombi(
  a: Pick<
    Adherent,
    | "statut_paiement"
    | "mode_paiement"
    | "nb_echeances"
    | "echeances_payees"
    | "engage_at"
    | "annule_at"
  >,
): TrombiStatut {
  const nb = a.nb_echeances || 1;
  const payees = a.echeances_payees || 0;

  // 🔴 Échec de prélèvement (détecté et enregistré).
  if (a.statut_paiement === "echec_paiement") {
    return {
      code: "echec",
      couleur: "rouge",
      label: nb > 1 ? `Prélèvement échoué ${payees}/${nb}` : "Paiement échoué",
    };
  }

  // 🟠 Carte, inscription faite, mais paiement JAMAIS mené au bout (aucune
  // tentative). Ne doit PAS s'afficher en vert « en cours » (faux positif
  // trompeur pour le coach) — état propre distinct du fractionné sain.
  if (estPaiementAFinaliser(a)) {
    return {
      code: "a_finaliser",
      couleur: "orange",
      label: "Paiement à finaliser",
    };
  }

  // 🟠 Carte comptant (1x) marquée « payé » SANS encaissement réel reflété :
  // incohérence à vérifier (jamais vert tant que l'encaissement n'est pas prouvé).
  if (paiementIncoherent(a)) {
    return {
      code: "a_verifier",
      couleur: "orange",
      label: "Paiement à vérifier",
    };
  }

  // 🟢 Soldé (carte 1x, fractionné terminé, ou espèces confirmées).
  if (estPaiementSolde(a)) {
    const especes =
      a.statut_paiement === "confirme_especes" || a.mode_paiement === "especes";
    return especes
      ? { code: "paye_especes", couleur: "vert", label: "Payé — espèces" }
      : { code: "paye_carte", couleur: "vert", label: "Payé — carte" };
  }

  // 🟠 Espèces pas encore encaissées.
  if (a.mode_paiement === "especes") {
    return {
      code: "attente_especes",
      couleur: "orange",
      label: "Espèces — en attente",
    };
  }

  // 🟢 Carte fractionnée en cours (déroulement normal) → avancement.
  return {
    code: "fractionne",
    couleur: "vert",
    label: nb > 1 ? `Carte ${payees}/${nb}` : "Carte — en cours",
  };
}

// ---- Filtre STATUT harmonisé (liste adhérents + trombinoscope) ----
// SOURCE UNIQUE des options + libellés, partagée par les deux vues. Chaque vue
// dérive le code via statutTrombi(a) puis appelle matchStatutFiltre — même
// granularité et mêmes libellés partout.
export type StatutFiltre =
  | "all"
  | "paye"
  | "confirme_especes"
  | "attente_especes"
  | "a_finaliser"
  | "fractionne"
  | "echec"
  | "a_verifier";

export const STATUT_FILTRE_OPTIONS: [StatutFiltre, string][] = [
  ["all", "Tous statuts"],
  ["paye", "Payé en ligne"],
  ["confirme_especes", "Espèces confirmées"],
  ["attente_especes", "Espèces en attente"],
  ["a_finaliser", "Paiement à finaliser"],
  ["fractionne", "Fractionné en cours"],
  ["echec", "Prélèvement échoué"],
  ["a_verifier", "Paiement à vérifier"],
];

// Chaque valeur de filtre correspond à UN code statutTrombi (1:1).
const STATUT_FILTRE_CODE: Record<Exclude<StatutFiltre, "all">, TrombiStatutCode> = {
  paye: "paye_carte",
  confirme_especes: "paye_especes",
  attente_especes: "attente_especes",
  a_finaliser: "a_finaliser",
  fractionne: "fractionne",
  echec: "echec",
  a_verifier: "a_verifier",
};

export function matchStatutFiltre(
  code: TrombiStatutCode,
  filtre: StatutFiltre,
): boolean {
  return filtre === "all" || code === STATUT_FILTRE_CODE[filtre];
}
