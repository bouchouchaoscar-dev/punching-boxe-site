// Changement de formule (ajout option prépa par l'adhérent, gestion admin).
// Helpers PURS (sans I/O) : éligibilité, prix de l'option (moteur de tarif
// réutilisé), diagnostic de ce qui reste à faire pour les relances, contenu
// adaptatif des mails. Les formules/labels viennent de lib/pricing (CONFIG_CLUB).
import type { Adherent } from "./types";
import { formuleCle, formuleLabel, prepaDuMois, type FormuleCle, type PackageType } from "./pricing";
import { fr } from "./typo";
import { resoudreOuverture } from "./campagnes";

// La formule actuelle est-elle « Boxe Française seule » ? (seul cas où l'adhérent
// peut ajouter la prépa lui-même ; jamais pour les autres formules.)
export function estBoxeSeule(a: Pick<Adherent, "package" | "option_prepa_physique">): boolean {
  return a.package === "boxe_classique" && !a.option_prepa_physique;
}

// L'adhérent peut-il ajouter l'option prépa à ce dossier ? (BF seule, non annulé)
export function peutAjouterPrepa(
  a: Pick<Adherent, "package" | "option_prepa_physique" | "annule_at">,
): boolean {
  return estBoxeSeule(a) && !a.annule_at;
}

// Prix de l'option prépa au palier dégressif DU JOUR (sans adhésion, sans remise :
// la grille n'applique pas la remise famille à l'option). Réutilise le moteur.
export function prixOptionPrepa(date: Date, saisonEnCours = false): number {
  return prepaDuMois(date, saisonEnCours);
}

// Libellé lisible d'une clé de formule (source unique pricing/CONFIG_CLUB).
export function labelFormuleCle(c: FormuleCle | null): string {
  switch (c) {
    case "boxe": return formuleLabel("boxe_classique", false);
    case "boxe_prepa": return formuleLabel("boxe_classique", true);
    case "savate_prepa": return formuleLabel("savate_prepa", false);
    default: return "—";
  }
}

export function labelFormuleDossier(a: Pick<Adherent, "package" | "option_prepa_physique">): string {
  return labelFormuleCle(formuleCle(a.package as PackageType, a.option_prepa_physique ?? false));
}

// Les trois formules du club (cartes de la modale admin), libellés CONFIG_CLUB.
export const FORMULES_CLE: FormuleCle[] = ["boxe", "boxe_prepa", "savate_prepa"];

// Décompose une clé de formule en (package, option_prepa) pour l'écriture dossier.
export function cleVersDossier(c: FormuleCle): { package: PackageType; option_prepa_physique: boolean } {
  if (c === "savate_prepa") return { package: "savate_prepa", option_prepa_physique: false };
  return { package: "boxe_classique", option_prepa_physique: c === "boxe_prepa" };
}

// ---- Relances d'un changement « admin » : ce qui reste à faire ----
export type RestantChangement = {
  paiementCarte: boolean; // supplément par lien carte non encaissé
  signature: boolean; // fiche actualisée non signée
};

// Un changement nécessite-t-il encore une action de l'adhérent ? (source admin,
// statut non annulé). Espèces (réglées sur place) et « offert » déjà signé → rien.
export function restantChangement(ch: {
  source: string | null;
  statut: string | null;
  mode_reglement: string | null;
  signature_requise: boolean | null;
  signe_at: string | null;
  supplementPaye: boolean; // le paiement carte lié est-il encaissé ?
}): RestantChangement {
  if (ch.statut === "annule") return { paiementCarte: false, signature: false };
  const paiementCarte = ch.mode_reglement === "carte" && !ch.supplementPaye;
  const signature = !!ch.signature_requise && !ch.signe_at;
  return { paiementCarte, signature };
}

export function changementAFaire(r: RestantChangement): boolean {
  return r.paiementCarte || r.signature;
}

// ---- Dérivation PURE du cache adherents.supplement_statut (écrit UNIQUEMENT par
// recalculerEtatPaiement, à partir de la réalité). Un supplément ACTIF non encaissé
// → carte prime (a_finaliser), sinon espèces (attente_especes). Sinon null. ----
export type ChangementReel = {
  statut: string | null;
  mode_reglement: string | null;
  montant_cents: number | null;
  paiementStatut: string | null; // statut du paiement lié (null si aucun)
};

export function calculerSupplementStatut(
  changements: ChangementReel[],
): "a_finaliser" | "attente_especes" | null {
  let cache: "a_finaliser" | "attente_especes" | null = null;
  for (const ch of changements) {
    if (ch.statut !== "actif") continue;
    if ((ch.montant_cents ?? 0) <= 0) continue; // 0 ou remboursement → rien à encaisser
    const paye = ch.paiementStatut === "paye";
    if (paye) continue;
    if (ch.mode_reglement === "carte") return "a_finaliser"; // carte prime
    if (ch.mode_reglement === "especes") cache = cache ?? "attente_especes";
  }
  return cache;
}

// Changements à ACTIVER (cas b carte, option B) : en attente de paiement, par
// carte, dont le supplément lié est désormais encaissé. Renvoie l'index.
export function changementActivable(ch: {
  statut: string | null;
  mode_reglement: string | null;
  paiementStatut: string | null;
}): boolean {
  return (
    ch.statut === "en_attente_paiement" &&
    ch.mode_reglement === "carte" &&
    ch.paiementStatut === "paye"
  );
}

// ---- Contenu ADAPTATIF des mails de relance (PUR) ----
export type MailRelanceChangement = {
  objet: string;
  salutation: string;
  corps: string[];
  boutons: ("payer" | "signer")[];
  signature: string;
};

export function mailRelanceChangement(p: {
  prenom: string;
  mineur: boolean;
  numero: 1 | 2;
  restant: RestantChangement;
  montantEuros: number;
  clubNom: string;
}): MailRelanceChangement {
  const prenom = (p.prenom || "").trim();
  const { salutation } = resoudreOuverture([{ prenom, mineur: p.mineur }]);
  const objet =
    p.numero === 1
      ? "Votre formule a été mise à jour : une dernière étape"
      : "Petit rappel pour finaliser votre nouvelle formule";
  const sujet = p.mineur ? `l'inscription de ${prenom}` : "votre inscription";
  const corps: string[] = [];
  const boutons: ("payer" | "signer")[] = [];

  corps.push(fr(`La formule ${p.mineur ? `de ${prenom}` : "de votre dossier"} a été mise à jour.`));
  if (p.restant.paiementCarte && p.restant.signature) {
    corps.push(fr(`Pour finaliser ${sujet}, il reste à régler le supplément de ${euroTxt(p.montantEuros)} et à signer votre fiche d'inscription actualisée.`));
    boutons.push("payer", "signer");
  } else if (p.restant.paiementCarte) {
    corps.push(fr(`Il reste simplement à régler le supplément de ${euroTxt(p.montantEuros)} par carte.`));
    boutons.push("payer");
  } else if (p.restant.signature) {
    corps.push(fr(`Il reste simplement à signer votre fiche d'inscription actualisée.`));
    boutons.push("signer");
  }
  if (p.numero === 2) corps.push("C'est notre dernier message automatique à ce sujet.");

  return {
    objet,
    salutation,
    corps,
    boutons,
    signature: `À très bientôt au club,\nL'équipe ${p.clubNom}`,
  };
}

// Montant en toutes lettres FR court (sans dépendre de Intl côté modules purs
// serveur) : réutilise euro() de pricing côté appelant si besoin ; ici simple.
function euroTxt(n: number): string {
  return `${n % 1 === 0 ? n : n.toFixed(2)} €`;
}
