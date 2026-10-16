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
  supplementPaye: boolean; // le paiement lié est-il encaissé ?
}): RestantChangement {
  if (ch.statut === "annule") return { paiementCarte: false, signature: false };
  // Paiement à relancer tant que le mode n'est pas choisi ('a_regler') OU que la
  // carte n'est pas réglée. JAMAIS pour les espèces (réglées sur place / en
  // attente côté club) ni pour un « offert ».
  const paiementCarte = (ch.mode_reglement === "a_regler" || ch.mode_reglement === "carte") && !ch.supplementPaye;
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
    // Mode non encore choisi par l'adhérent ('a_regler') OU carte non réglée → à
    // finaliser (rouge). Espèces en attente → orange. 'offert'/null (fusionné) : rien.
    if (ch.mode_reglement === "carte" || ch.mode_reglement === "a_regler") return "a_finaliser";
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

// Mode de règlement d'un changement, tel que PERSISTÉ (changements_formule).
// null = fusionné dans le total (cas a) / aucun montant. 'especes' reste lisible
// (parcours adhérent + anciennes lignes admin « réglé sur place »), mais n'est
// plus proposé à la création côté admin.
export type ModeChangement =
  | "a_regler"
  | "especes"
  | "offert"
  | "remboursement_carte"
  | "remboursement_hors_ligne"
  | null;

export type ResolutionChangement =
  | { ok: true; mode: ModeChangement; montant: number; nouveauTotal: number | null }
  | { ok: false; error: string };

// Résout le règlement d'un changement déclenché par l'ADMIN (PUR, fail-closed).
// Supplément : uniquement « à régler par l'adhérent » (il choisira carte ou
// espèces en signant sa nouvelle fiche) ou « offert ». Toute autre valeur — dont
// l'ancien « réglé sur place en espèces » (especes_sur_place) — est REFUSÉE.
// Cas a (ni encaissé ni engagé) : le montant est FUSIONNÉ dans le total.
export function resoudreChangementAdmin(p: {
  sens: "supplement" | "remboursement" | "aucun";
  reglement?: string | null;
  montantEuros: number; // déjà normalisé (>= 0)
  engage: boolean;
  total: number;
}): ResolutionChangement {
  if (p.sens === "supplement") {
    if (p.reglement === "offert") return { ok: true, mode: "offert", montant: 0, nouveauTotal: null };
    if (p.reglement === "a_regler") {
      if (p.montantEuros <= 0) return { ok: false, error: "Montant du supplément requis." };
      // Cas a : fusion dans le total. Cas b (engagé) : supplément séparé à régler.
      if (!p.engage) return { ok: true, mode: null, montant: p.montantEuros, nouveauTotal: Math.round((p.total + p.montantEuros) * 100) / 100 };
      return { ok: true, mode: "a_regler", montant: p.montantEuros, nouveauTotal: null };
    }
    return { ok: false, error: "Mode de règlement du supplément invalide (attendu : « à régler par l'adhérent » ou « offert »)." };
  }
  if (p.sens === "remboursement") {
    if (p.montantEuros <= 0) return { ok: false, error: "Montant du remboursement requis." };
    if (!p.engage) return { ok: true, mode: null, montant: -p.montantEuros, nouveauTotal: Math.round((p.total - p.montantEuros) * 100) / 100 };
    const mode: ModeChangement = p.reglement === "remboursement_carte" ? "remboursement_carte" : "remboursement_hors_ligne";
    return { ok: true, mode, montant: p.montantEuros, nouveauTotal: null };
  }
  return { ok: true, mode: null, montant: 0, nouveauTotal: null };
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
