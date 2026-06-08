import type { Adherent } from "./types";
import { evaluerDossier } from "./dossier";
import { estEngage } from "./engagement";

// Phrase de synthèse dynamique affichée à l'adhérent (espace client) : croise
// l'état des DOCUMENTS et du PAIEMENT pour dire où en est le dossier et la
// prochaine action. Module PUR (aucun import serveur) → utilisable côté client.

export type SyntheseTone = "success" | "info" | "action" | "danger";

// `rappel` = note secondaire (ex. rappel espèces) rendue en nuance plus douce,
// utile pour ne pas surcharger/angoisser un encart rouge (refus).
export type Synthese = { text: string; tone: SyntheseTone; rappel?: string };

const RAPPEL_ESPECES =
  "N'oubliez pas de régler votre cotisation en espèces lors du prochain cours.";
const RAPPEL_ESPECES_COMP =
  "Pensez aussi à régler votre cotisation en espèces au prochain cours.";

const DOCS_OBLIG = [
  { base: "fiche", url: "fiche_inscription_url", label: "la fiche d'inscription" },
  { base: "reglement", url: "reglement_url", label: "le règlement intérieur" },
  { base: "photo", url: "photo_url", label: "la photo d'identité" },
] as const;
const CERTIF = {
  base: "certificat",
  url: "certificat_medical_url",
  label: "le certificat médical",
} as const;

export function syntheseDossier(a: Adherent, paidEcheances: number): Synthese {
  const d = evaluerDossier(a);

  // ---- Détail par document ----
  const docStatut = (base: string, urlKey: keyof Adherent) => {
    const url = a[urlKey] as string | null;
    const refus = a[`${base}_motif_refus` as keyof Adherent] as string | null;
    const valide = !!a[`${base}_valide` as keyof Adherent];
    if (refus) return "refus";
    if (!url) return "manquant";
    return valide ? "valide" : "attente";
  };
  const tous = [...DOCS_OBLIG, CERTIF];
  const refusee = tous.find((x) => docStatut(x.base, x.url) === "refus");
  const obligManquantes = DOCS_OBLIG.filter(
    (x) => docStatut(x.base, x.url) === "manquant",
  );
  const certifManquant =
    docStatut("certificat", "certificat_medical_url") === "manquant";
  const enAttenteValidation = tous.some(
    (x) => docStatut(x.base, x.url) === "attente",
  );
  const docsTousValides = d.statut === "valide"; // 4/4

  // ---- État paiement ----
  const engage = estEngage(a);
  const echec = a.statut_paiement === "echec_paiement";
  const solde = a.statut_paiement === "paye";
  const especesOk = a.statut_paiement === "confirme_especes";
  const fracEnCours =
    a.mode_paiement.startsWith("stripe") &&
    (a.nb_echeances ?? 1) > 1 &&
    paidEcheances >= 1 &&
    !solde;
  // Fil rouge espèces : tant que la cotisation espèces n'est pas confirmée.
  const especesDues =
    a.mode_paiement === "especes" && a.statut_paiement === "en_attente";

  // ---- Priorité 1 : urgences ----
  // Échec sur un dossier DÉJÀ engagé = une échéance ultérieure a échoué.
  if (echec && engage)
    return {
      tone: "danger",
      text: "Votre dernier prélèvement a échoué. Merci de régulariser votre paiement pour finaliser votre inscription.",
    };
  if (refusee)
    return {
      tone: "danger",
      text: `Une pièce a été refusée (${refusee.label}). Merci de la redéposer ci-dessous.`,
      // Sur encart rouge, le rappel espèces reste en note douce (non anxiogène).
      rappel: especesDues ? RAPPEL_ESPECES_COMP : undefined,
    };

  // Paiement non finalisé : carte/fractionné, rien encaissé (abandon ou échec
  // du 1er paiement). Prioritaire sur la validation des documents.
  if (!engage && a.mode_paiement.startsWith("stripe"))
    return {
      tone: "action",
      text: "Votre paiement n'a pas été finalisé. Cliquez sur « Finaliser le paiement » ci-dessous pour le régler et valider votre inscription.",
    };

  // Préfixe quand le paiement est déjà acquis mais les docs incomplets.
  const prefixePaye =
    solde || especesOk
      ? "Votre paiement est bien passé. "
      : fracEnCours
        ? "Votre 1ère échéance est bien passée. "
        : "";
  // Complément espèces ajouté à la phrase (cas orange/action).
  const compEspeces = especesDues ? ` ${RAPPEL_ESPECES_COMP}` : "";

  // ---- Priorité 2 : documents incomplets ----
  if (obligManquantes.length > 0) {
    const liste = obligManquantes.map((x) => x.label).join(", ");
    return {
      tone: "action",
      text: `${prefixePaye}Il vous manque ${liste} à déposer pour finaliser votre dossier.${compEspeces}`,
    };
  }
  if (certifManquant) {
    return {
      tone: "action",
      text: `${prefixePaye}Il vous manque ${CERTIF.label} pour finaliser votre dossier.${compEspeces}`,
    };
  }
  if (enAttenteValidation) {
    if (especesDues)
      return {
        tone: "action",
        text: `Vos pièces ont bien été déposées et seront vérifiées par Pascal. ${RAPPEL_ESPECES}`,
      };
    return {
      tone: "info",
      text: `${prefixePaye}Vos pièces ont bien été reçues. Pascal va les vérifier prochainement.`,
    };
  }

  // ---- Priorité 3 : documents tous validés → conclusion selon le paiement ----
  if (docsTousValides && (solde || especesOk))
    return {
      tone: "success",
      text: "Votre dossier est complet et validé. Pièces validées, paiement réglé : tout est bon pour votre inscription ! 🥊",
    };
  if (docsTousValides && fracEnCours) {
    const n = a.nb_echeances ?? paidEcheances;
    const part =
      paidEcheances <= 1
        ? "votre 1ère échéance est bien passée"
        : `${paidEcheances}/${n} échéances sont réglées`;
    return {
      tone: "success",
      text: `Votre dossier est validé ! ${part[0].toUpperCase()}${part.slice(1)}, les prochaines seront prélevées automatiquement aux dates prévues.`,
    };
  }
  if (docsTousValides && especesDues)
    return {
      tone: "action",
      text: "Vos pièces ont été validées. Il ne reste plus qu'à régler votre cotisation en espèces lors du prochain cours.",
    };
  // Docs validés mais paiement carte non encore passé (cas rare).
  return {
    tone: "action",
    text: "Vos pièces sont validées. Il reste à finaliser votre paiement pour boucler l'inscription.",
  };
}
