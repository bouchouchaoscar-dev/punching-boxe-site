// Relance des DOSSIERS sans mode de paiement (statut « à finaliser », mode null).
// Contenu PUR (testable) + diagnostic de ce qui manque (documents / paiement).
// Vouvoiement, aucun accord genré, pas de tiret long, parent si mineur.
import { resoudreOuverture } from "./campagnes";
import { statutTrombi } from "./paiement";
import { fr } from "./typo";

// Candidat à la relance « dossier sans mode de paiement » : statut « à finaliser »
// (SOURCE UNIQUE statutTrombi), mode null, non engagé, non annulé, rien encaissé.
// N'inclut PAS les cartes non finalisées (mode stripe → relances panier).
export function estDossierARelancer(a: {
  statut_paiement: string | null; mode_paiement: string | null;
  nb_echeances: number | null; echeances_payees: number | null;
  engage_at: string | null; annule_at: string | null;
}): boolean {
  if (a.mode_paiement != null) return false;
  if (a.engage_at != null || a.annule_at != null) return false;
  if ((a.echeances_payees ?? 0) !== 0) return false;
  return statutTrombi(a as Parameters<typeof statutTrombi>[0]).code === "a_finaliser";
}

// Numéro de relance à envoyer (ou null), selon les délais et les claims déjà posés.
export function numeroRelanceDossier(p: {
  createdAt: string;
  relance1At: string | null;
  relance2At: string | null;
  now: number;
  jours1: number;
  jours2: number;
}): 1 | 2 | null {
  const J = 24 * 60 * 60 * 1000;
  if (!p.relance1At) {
    return new Date(p.createdAt).getTime() <= p.now - p.jours1 * J ? 1 : null;
  }
  if (!p.relance2At) {
    return new Date(p.relance1At).getTime() <= p.now - p.jours2 * J ? 2 : null;
  }
  return null;
}

export type EtatRelance = "rien" | "partiel" | "complet";

// Ce qui manque au dossier (documents) + toujours le choix du mode de paiement.
export function etatDossierRelance(a: {
  fiche_valide?: boolean | null;
  reglement_valide?: boolean | null;
  photo_valide?: boolean | null;
  certificat_valide?: boolean | null;
  certificat_medical_url?: string | null;
  fiche_signee_at?: string | null;
  reglement_signee_at?: string | null;
  fiche_inscription_url?: string | null;
  reglement_url?: string | null;
  photo_url?: string | null;
}): { etat: EtatRelance; manques: string[] } {
  const certOk = !!a.certificat_valide && !!a.certificat_medical_url;
  const manquesDocs: string[] = [];
  if (!a.fiche_valide) manquesDocs.push("la fiche d'inscription");
  if (!a.reglement_valide) manquesDocs.push("le règlement intérieur");
  if (!a.photo_valide) manquesDocs.push("la photo d'identité");
  if (!certOk) manquesDocs.push("le certificat médical");

  const rienFait =
    !a.fiche_signee_at && !a.reglement_signee_at && !a.fiche_inscription_url &&
    !a.reglement_url && !a.photo_url && !a.certificat_medical_url;
  const docsComplets = manquesDocs.length === 0;
  const etat: EtatRelance = rienFait ? "rien" : docsComplets ? "complet" : "partiel";
  return { etat, manques: [...manquesDocs, "le choix du mode de paiement"] };
}

// Joint une liste en français : « a, b et c ».
function joindre(items: string[]): string {
  if (items.length <= 1) return items[0] ?? "";
  return `${items.slice(0, -1).join(", ")} et ${items[items.length - 1]}`;
}

export type MailRelanceDossier = { objet: string; salutation: string; corps: string[]; boutonLabel: string; signature: string };

export function mailRelanceDossier(p: {
  prenom: string;
  mineur: boolean;
  numero: 1 | 2;
  etat: EtatRelance;
  manques: string[];
  clubNom: string;
}): MailRelanceDossier {
  const prenom = (p.prenom || "").trim();
  const { salutation } = resoudreOuverture([{ prenom, mineur: p.mineur }]);
  const objet = p.numero === 1 ? "Votre inscription est presque terminée" : "Il ne manque plus grand-chose pour votre inscription";
  const boutonLabel = "Compléter mon inscription";
  const signature = `À très bientôt au club,\nL'équipe ${p.clubNom}`;
  const sujet = p.mineur ? `l'inscription de ${prenom}` : "votre inscription";
  const dossier = p.mineur ? "le dossier" : "votre dossier";

  const corps: string[] = [];
  if (p.etat === "rien") {
    corps.push(fr(`${p.mineur ? `L'inscription de ${prenom}` : "Votre inscription"} au club n'est pas encore finalisée.`));
    corps.push(fr(`Il reste à compléter ${dossier} (les documents) puis à choisir le mode de paiement pour régler l'adhésion. Tout se fait en quelques minutes depuis votre espace adhérent.`));
  } else if (p.etat === "partiel") {
    corps.push(fr(`Pour finaliser ${sujet}, il reste à fournir ${joindre(p.manques)}.`));
    corps.push(fr(`Tout se fait en quelques minutes depuis votre espace adhérent.`));
  } else {
    corps.push(fr(`${p.mineur ? `Le dossier de ${prenom} est complet` : "Votre dossier est complet"}, bravo !`));
    corps.push(fr(`Il ne reste plus qu'à choisir le mode de paiement pour régler l'adhésion, depuis votre espace adhérent.`));
  }
  if (p.numero === 2) corps.push("C'est notre dernier message automatique à ce sujet.");

  return { objet, salutation, corps, boutonLabel, signature };
}
