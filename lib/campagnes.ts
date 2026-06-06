import type { Adherent } from "./types";
import { CLUB } from "./constants";

export type StatutCampagne = "brouillon" | "envoye" | "erreur";

export interface Campagne {
  id: string;
  titre: string;
  objet: string;
  contenu: string;
  liste_type: string;
  liste_filtre: unknown;
  nb_destinataires: number | null;
  statut: StatutCampagne;
  envoye_at: string | null;
  created_at: string;
}

export interface TemplateMail {
  id: string;
  nom: string;
  objet: string;
  contenu: string;
  est_defaut: boolean;
  created_at: string;
}

export interface ContactMailing {
  id: string;
  nom: string | null;
  prenom: string | null;
  email: string;
  telephone: string | null;
  source: string;
  created_at: string;
}

// ---- Listes intelligentes (filtres sur les adhérents) ----
export type SmartListKey =
  | "tous"
  | "boxe"
  | "savate"
  | "adultes"
  | "jeunes"
  | "avec_prepa"
  | "sans_prepa"
  | "certificat_manquant"
  | "especes_attente"
  | "dossier_incomplet"
  | "nouveaux";

export const SMART_LISTS: { key: SmartListKey; label: string }[] = [
  { key: "tous", label: "Tous les adhérents" },
  { key: "boxe", label: "Formule Boxe Française" },
  { key: "savate", label: "Formule Savate & Prépa" },
  { key: "adultes", label: "Adultes uniquement" },
  { key: "jeunes", label: "Jeunes uniquement" },
  { key: "avec_prepa", label: "Avec option Prépa Physique" },
  { key: "sans_prepa", label: "Sans option Prépa Physique" },
  { key: "certificat_manquant", label: "Certificat médical manquant" },
  { key: "especes_attente", label: "Paiement espèces en attente" },
  { key: "dossier_incomplet", label: "Dossier incomplet" },
  { key: "nouveaux", label: "Nouveaux membres cette saison" },
];

/** Prédicat d'une liste intelligente sur un adhérent. */
function matchSmartList(a: Adherent, key: SmartListKey): boolean {
  switch (key) {
    case "tous":
      return true;
    case "boxe":
      return a.package === "boxe_classique";
    case "savate":
      return a.package === "savate_prepa";
    case "adultes":
      return a.type_adherent === "adulte";
    case "jeunes":
      return a.type_adherent === "jeune";
    case "avec_prepa":
      return !!a.option_prepa_physique;
    case "sans_prepa":
      return !a.option_prepa_physique;
    case "certificat_manquant":
      return !a.certificat_medical_url;
    case "especes_attente":
      return a.mode_paiement === "especes" && a.statut_paiement === "en_attente";
    case "dossier_incomplet":
      return !a.documents_valides;
    case "nouveaux":
      return !!a.nouveau_membre && a.saison === CLUB.saison;
    default:
      return false;
  }
}

/** Adhérents correspondant à AU MOINS une des listes cochées (union). */
export function filtrerAdherents(
  adherents: Adherent[],
  keys: SmartListKey[],
): Adherent[] {
  if (keys.length === 0) return [];
  return adherents.filter((a) => keys.some((k) => matchSmartList(a, k)));
}

// ---- Variables de personnalisation ----
export const VARIABLES: { token: string; label: string }[] = [
  { token: "{{prenom}}", label: "Prénom" },
  { token: "{{nom}}", label: "Nom" },
  { token: "{{formule}}", label: "Formule" },
  { token: "{{montant}}", label: "Montant" },
];

export type DestinataireVars = {
  prenom?: string | null;
  nom?: string | null;
  formule?: string | null;
  montant?: number | string | null;
};

export function remplacerVariables(texte: string, v: DestinataireVars): string {
  return texte
    .replace(/\{\{prenom\}\}/g, v.prenom ?? "")
    .replace(/\{\{nom\}\}/g, v.nom ?? "")
    .replace(/\{\{formule\}\}/g, v.formule ?? "")
    .replace(/\{\{montant\}\}/g, v.montant != null ? String(v.montant) : "");
}

export function formuleLabel(pkg?: string | null): string {
  return pkg === "savate_prepa" ? "Savate & Prépa" : "Boxe Française";
}

// ---- Templates par défaut (auto-insérés en base s'ils sont absents) ----
export const DEFAULT_TEMPLATES: { nom: string; objet: string; contenu: string }[] = [
  {
    nom: "Mail de rentrée septembre",
    objet: "C'est la rentrée au Punching Boxe ! 🥊",
    contenu: `Bonjour {{prenom}},

La nouvelle saison 2026-2027 commence bientôt et nous avons hâte de vous retrouver sur les tatamis !

Les cours reprennent en septembre.
Retrouvez tous les horaires sur notre site : punching-boxe.com

À très bientôt,
Pascal et l'équipe du Punching Boxe`,
  },
  {
    nom: "Relance certificat médical manquant",
    objet: "⚠️ Document manquant — Certificat médical",
    contenu: `Bonjour {{prenom}},

Votre dossier d'inscription est presque complet ! Il nous manque votre certificat médical pour finaliser votre inscription.

Connectez-vous à votre espace adhérent pour le déposer : punching-boxe.com/mon-espace

Merci et à bientôt,
Pascal Bouchoucha`,
  },
  {
    nom: "Relance paiement espèces en attente",
    objet: "💰 Règlement en attente — Punching Boxe",
    contenu: `Bonjour {{prenom}},

Nous n'avons pas encore reçu votre règlement de {{montant}}€ pour la saison 2026-2027.

Pensez à régler en espèces auprès du professeur lors de votre prochain cours.

À bientôt,
Pascal Bouchoucha`,
  },
  {
    nom: "Mail de fin de saison juin",
    objet: "Fin de saison — Merci et à l'année prochaine ! 🥊",
    contenu: `Bonjour {{prenom}},

La saison se termine bientôt et nous tenions à vous remercier pour votre fidélité cette année.

Les inscriptions pour la saison 2027-2028 ouvriront en juin.
Restez connectés !

À l'année prochaine,
Pascal et toute l'équipe`,
  },
  {
    nom: "Annonce modification horaires",
    objet: "📅 Modification des horaires",
    contenu: `Bonjour {{prenom}},

Nous vous informons d'une modification des horaires de cours.

[Détaillez ici les changements]

Pour toute question :
contact@punching-boxe.com
07 60 83 98 30

Cordialement,
Pascal Bouchoucha`,
  },
];
