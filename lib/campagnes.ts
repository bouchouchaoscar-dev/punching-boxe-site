import type { Adherent } from "./types";
import { saisonCourante } from "./saison";
import { classerAncien } from "./anciennete";
import { estActifCompte } from "./adherents-actifs";

export type StatutCampagne =
  | "brouillon"
  | "envoye"
  | "erreur"
  | "planifiee"
  | "en_cours";

// Format figé à l'envoi. Deux variantes coexistent :
// - ancien (plat)   : { nom, prenom, email }  → 1 entrée = 1 personne
// - nouveau (groupé): { email, personnes[] }  → 1 entrée = 1 email, N personnes
//   (familles partageant une adresse, préservées).
export interface DestinataireCampagne {
  email: string;
  nom?: string | null;
  prenom?: string | null;
  personnes?: { nom?: string | null; prenom?: string | null }[];
}

/**
 * Assemble une liste de prénoms en salutation lisible :
 * [] → "", ["Oscar"] → "Oscar", ["Oscar","Léon"] → "Oscar et Léon",
 * ["Oscar","Léon","Marie"] → "Oscar, Léon et Marie".
 */
export function joindrePrenoms(
  prenoms: (string | null | undefined)[],
): string {
  const uniq = [
    ...new Set(prenoms.map((p) => (p ?? "").trim()).filter(Boolean)),
  ];
  if (uniq.length === 0) return "";
  if (uniq.length === 1) return uniq[0];
  return `${uniq.slice(0, -1).join(", ")} et ${uniq[uniq.length - 1]}`;
}

// Une personne candidate à un envoi (après dédoublonnage par identité en amont).
export type PersonneEnvoi = {
  personKey: string;
  email: string;
  prenom?: string | null;
  nom?: string | null;
  formule?: string | null;
  montant?: number | string | null;
  saison?: string | null;
  derniere_saison?: string | null;
  disciplines?: string | null;
};

export type EnvoiGroupe = {
  email: string;
  personnes: PersonneEnvoi[];
  vars: DestinataireVars;
};

/**
 * ÉTAGE 2 du sourcing : regroupe par EMAIL une liste de personnes DÉJÀ
 * dédoublonnées par identité (étage 1, en amont). Les familles (personnes
 * différentes, même email) sont préservées : 1 email = 1 envoi portant TOUTES
 * les personnes.
 *
 * - `{{prenom}}` devient la salutation jointe ("Oscar et Léon").
 * - Si plusieurs personnes sur l'email, les variables INDIVIDUELLES
 *   (formule/montant/disciplines/dernière saison) sont VIDÉES (afficher la
 *   valeur d'un seul membre serait trompeur). Si une seule, valeurs normales.
 * - `exclus` = emails désinscrits (exclusion RGPD au niveau email).
 */
export function regrouperParEmail(
  personnes: PersonneEnvoi[],
  exclus: Set<string>,
  saisonRef: string,
): { envois: EnvoiGroupe[]; personnesExclues: number } {
  const groupes = new Map<string, PersonneEnvoi[]>();
  for (const p of personnes) {
    const email = p.email.trim().toLowerCase();
    if (!email) continue;
    const arr = groupes.get(email);
    if (arr) arr.push(p);
    else groupes.set(email, [p]);
  }

  const envois: EnvoiGroupe[] = [];
  let personnesExclues = 0;
  for (const [email, membres] of groupes) {
    if (exclus.has(email)) {
      personnesExclues += membres.length;
      continue;
    }
    const multi = membres.length > 1;
    const rep = membres[0];
    const prenom = joindrePrenoms(membres.map((m) => m.prenom));
    // Nom commun si tous identiques (famille), sinon celui du représentant.
    const noms = [
      ...new Set(membres.map((m) => (m.nom ?? "").trim()).filter(Boolean)),
    ];
    const nomGroupe = noms.length === 1 ? noms[0] : rep.nom ?? "";
    const vars: DestinataireVars = {
      prenom,
      nom: multi ? nomGroupe : rep.nom ?? "",
      saison: multi ? saisonRef : rep.saison || saisonRef,
      formule: multi ? "" : rep.formule ?? "",
      montant: multi ? "" : rep.montant ?? "",
      derniere_saison: multi ? "" : rep.derniere_saison ?? "",
      disciplines: multi ? "" : rep.disciplines ?? "",
    };
    envois.push({ email, personnes: membres, vars });
  }
  return { envois, personnesExclues };
}

export type TypeEnvoi = "campagne" | "individuel";

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
  destinataires_liste: DestinataireCampagne[] | null;
  created_at: string;
  // Historique unifié : distingue les campagnes groupées des mails individuels.
  type?: TypeEnvoi;
  cible?: string | null;
  nb_envoyes?: number | null;
  nb_exclus?: number | null;
  // Campagnes planifiées (envoi différé).
  scheduled_at?: string | null;
  etat?: "active" | "pause" | null;
}

export interface TemplateMail {
  id: string;
  nom: string;
  objet: string;
  contenu: string;
  categorie: string | null;
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
  | "non_reinscrits"
  | "boxe"
  | "savate"
  | "adultes"
  | "jeunes"
  | "fait_prepa"
  | "certificat_manquant"
  | "especes_attente"
  | "echec_paiement"
  | "dossier_incomplet"
  | "nouveaux"
  | "adherents_actuels";

export const SMART_LISTS: { key: SmartListKey; label: string }[] = [
  { key: "adherents_actuels", label: "Adhérents actuels (saison en cours)" },
  { key: "tous", label: "Tous les adhérents" },
  { key: "non_reinscrits", label: "Adhérents non réinscrits (saison dernière)" },
  { key: "boxe", label: "Formule Boxe Française" },
  { key: "savate", label: "Formule Savate et Prépa" },
  { key: "adultes", label: "Adultes uniquement" },
  { key: "jeunes", label: "Jeunes uniquement" },
  { key: "fait_prepa", label: "Fait de la préparation physique" },
  { key: "certificat_manquant", label: "Certificat médical manquant" },
  { key: "especes_attente", label: "Paiement espèces en attente" },
  { key: "echec_paiement", label: "À régulariser (échec de paiement)" },
  { key: "dossier_incomplet", label: "Dossier incomplet" },
  { key: "nouveaux", label: "Nouveaux membres cette saison" },
];

/** Prédicat d'une liste intelligente sur un adhérent. */
function matchSmartList(a: Adherent, key: SmartListKey): boolean {
  switch (key) {
    // EXCEPTION : "Tous" = toutes saisons, tous statuts (usage admin).
    case "tous":
      return true;
    // Filtres de TYPE transversaux (jeune/adulte) : non gatés ici, ils affinent
    // une base ; la base "type seul" est déjà restreinte aux actifs courants.
    case "adultes":
      return a.type_adherent === "adulte";
    case "jeunes":
      return a.type_adherent === "jeune";
    // EXCEPTION : segment cross-saison, géré dans filtrerAdherents.
    case "non_reinscrits":
      return false;

    // ---- Sous-segments de "Adhérents actuels" : ACTIFS + SAISON EN COURS ----
    case "adherents_actuels":
      return estActifCourant(a);
    case "boxe":
      return estActifCourant(a) && a.package === "boxe_classique";
    case "savate":
      return estActifCourant(a) && a.package === "savate_prepa";
    case "fait_prepa":
      // Pratique réellement la prépa : Savate & Prépa (incluse) OU BF + option.
      return (
        estActifCourant(a) &&
        (a.package === "savate_prepa" ||
          (a.package === "boxe_classique" && !!a.option_prepa_physique))
      );
    case "certificat_manquant":
      return estActifCourant(a) && !a.certificat_medical_url;
    case "especes_attente":
      return (
        estActifCourant(a) &&
        a.mode_paiement === "especes" &&
        a.statut_paiement === "en_attente"
      );
    case "dossier_incomplet":
      return estActifCourant(a) && !a.documents_valides;
    case "nouveaux":
      return estActifCourant(a) && !!a.nouveau_membre;
    // "À régulariser" : échec de paiement non fermé de la saison en cours
    // (inclut un 1er paiement échoué, qui n'est pas encore "actif").
    case "echec_paiement":
      return (
        !a.annule_at &&
        a.saison === saisonCourante(new Date()) &&
        a.statut_paiement === "echec_paiement"
      );
    default:
      return false;
  }
}

/** Adhérents correspondant à AU MOINS une des listes cochées (union). */
// Clés de TYPE (jeune/adulte) : filtres TRANSVERSAUX appliqués en ET, pas des
// listes unionnées (sinon "Tous" ∪ "Adultes" = tout le monde, le filtre type
// devient inopérant).
const TYPE_KEYS: SmartListKey[] = ["adultes", "jeunes"];

// Actif = défini par le helper CENTRAL (non fermé + engagé/payé OU espèces en
// attente). "Actif de la SAISON EN COURS" pour les sous-segments du bloc haut.
const estActifAdherent = estActifCompte;
const estActifCourant = (a: Adherent): boolean =>
  estActifCompte(a) && a.saison === saisonCourante(new Date());
// Identité d'une personne (pour le cross-saison) : clé de matching si dispo,
// sinon email.
const identitePersonne = (a: Adherent): string =>
  a.match_key || (a.email ? a.email.toLowerCase() : a.id);

/**
 * Ensemble des dossiers (ids) ACTIFS la saison DERNIÈRE mais dont la personne
 * n'a PAS de dossier actif la saison EN COURS → non réinscrits (relance).
 */
function idsNonReinscrits(adherents: Adherent[]): Set<string> {
  const courante = saisonCourante(new Date());
  const y = parseInt(courante.slice(0, 4), 10);
  const precedente = `${y - 1}-${y}`;
  const actifsCourante = new Set<string>();
  for (const a of adherents) {
    if (a.saison === courante && estActifAdherent(a))
      actifsCourante.add(identitePersonne(a));
  }
  const res = new Set<string>();
  for (const a of adherents) {
    if (
      a.saison === precedente &&
      estActifAdherent(a) &&
      !actifsCourante.has(identitePersonne(a))
    )
      res.add(a.id);
  }
  return res;
}

export function filtrerAdherents(
  adherents: Adherent[],
  keys: SmartListKey[],
): Adherent[] {
  if (keys.length === 0) return [];
  const typeKeys = keys.filter((k) => TYPE_KEYS.includes(k));
  const baseKeys = keys.filter((k) => !TYPE_KEYS.includes(k));

  // Précalcul du segment CROSS-ROW "non réinscrits" (si demandé).
  const nonReinscrits = baseKeys.includes("non_reinscrits")
    ? idsNonReinscrits(adherents)
    : null;
  const matchBase = (a: Adherent) =>
    baseKeys.some((k) =>
      k === "non_reinscrits" ? !!nonReinscrits?.has(a.id) : matchSmartList(a, k),
    );

  // Base = union des listes "non-type". Si aucune n'est cochée (ex. seulement
  // "Adultes"/"Jeunes"), la base = les ACTIFS de la saison en cours (le filtre
  // type affine ensuite) — surtout pas tous les dossiers/toutes saisons.
  const base =
    baseKeys.length > 0
      ? adherents.filter(matchBase)
      : adherents.filter(estActifCourant);

  // Filtre type en ET : on ne garde que jeunes/adultes selon la sélection.
  if (typeKeys.length > 0) {
    return base.filter((a) => typeKeys.some((k) => matchSmartList(a, k)));
  }
  return base;
}

// ---- Segments ANCIENS (non-natifs importés), classés dynamiquement ----
export type SegmentAncienKey =
  | "anciens_saison_derniere"
  | "anciens_tiedes"
  | "anciens_froids";

export const SEGMENTS_ANCIENS: { key: SegmentAncienKey; label: string }[] = [
  { key: "anciens_saison_derniere", label: "Anciens de la saison dernière" },
  { key: "anciens_tiedes", label: "Anciens tièdes (adhésion encore gratuite)" },
  { key: "anciens_froids", label: "Anciens froids (adhésion à repayer)" },
];

export type DisciplineKey = "BF" | "SAVATE" | "LES_2";
export const DISCIPLINES: { key: DisciplineKey; label: string }[] = [
  { key: "BF", label: "Boxe Française" },
  { key: "SAVATE", label: "Savate" },
  { key: "LES_2", label: "Les deux" },
];

// Ligne de la vue anciens_recence (1 par ancien).
export type AncienRecence = {
  id: string;
  nom: string | null;
  prenom: string | null;
  email: string | null;
  derniere_saison: string | null;
  disciplines: string[] | null;
};

const SEGMENT_VERS_CLASSE: Record<SegmentAncienKey, string> = {
  anciens_saison_derniere: "saison_derniere",
  anciens_tiedes: "tiede",
  anciens_froids: "froid",
};

/**
 * Filtre les anciens selon les segments cochés (union) + un filtre discipline
 * optionnel (OU). La classe est calculée par rapport à `saisonRef` → dynamique.
 */
export function filtrerAnciens<
  T extends { derniere_saison: string | null; disciplines: string[] | null },
>(
  anciens: T[],
  segments: SegmentAncienKey[],
  disciplines: DisciplineKey[],
  saisonRef: string,
): T[] {
  if (segments.length === 0) return [];
  const classesVoulues = new Set(segments.map((s) => SEGMENT_VERS_CLASSE[s]));
  return anciens.filter((a) => {
    const classe = classerAncien(a.derniere_saison, saisonRef);
    if (!classe || !classesVoulues.has(classe)) return false;
    if (disciplines.length > 0) {
      const d = a.disciplines ?? [];
      if (!disciplines.some((x) => d.includes(x))) return false;
    }
    return true;
  });
}

// ---- Variables de personnalisation (texte) ----
export const VARIABLES: { token: string; label: string }[] = [
  { token: "{{prenom}}", label: "Prénom" },
  { token: "{{nom}}", label: "Nom" },
  { token: "{{formule}}", label: "Formule" },
  { token: "{{montant}}", label: "Montant" },
  { token: "{{saison}}", label: "Saison en cours" },
  { token: "{{derniere_saison}}", label: "Dernière saison (ancien)" },
  { token: "{{disciplines}}", label: "Disciplines (ancien)" },
];

// ---- Boutons (rendus en CTA orange cliquable par renderCampagne) ----
export const BOUTONS: { token: string; label: string }[] = [
  { token: "{{bouton_inscription}}", label: "Bouton « S'inscrire »" },
  { token: "{{bouton_espace}}", label: "Bouton « Mon espace »" },
];

export type DestinataireVars = {
  prenom?: string | null;
  nom?: string | null;
  formule?: string | null;
  montant?: number | string | null;
  saison?: string | null;
  derniere_saison?: string | null;
  disciplines?: string | null;
};

export function remplacerVariables(texte: string, v: DestinataireVars): string {
  return texte
    .replace(/\{\{prenom\}\}/g, v.prenom ?? "")
    .replace(/\{\{nom\}\}/g, v.nom ?? "")
    .replace(/\{\{formule\}\}/g, v.formule ?? "")
    .replace(/\{\{montant\}\}/g, v.montant != null ? String(v.montant) : "")
    .replace(/\{\{saison\}\}/g, v.saison ?? "")
    .replace(/\{\{derniere_saison\}\}/g, v.derniere_saison ?? "")
    .replace(/\{\{disciplines\}\}/g, v.disciplines ?? "");
}

// ---- Catégories de templates (4 familles) ----
export type CategorieTemplate =
  | "informatif"
  | "relance_admin"
  | "reinscription"
  | "reactivation";

export const CATEGORIES: { key: CategorieTemplate; label: string }[] = [
  { key: "informatif", label: "Informatif" },
  { key: "relance_admin", label: "Relance administrative" },
  { key: "reinscription", label: "Réinscription" },
  { key: "reactivation", label: "Réactivation" },
];

// Libellés disciplines (pour {{disciplines}} propre).
export function disciplinesLabel(ds: string[] | null | undefined): string {
  const map: Record<string, string> = {
    BF: "Boxe Française",
    SAVATE: "Savate",
    LES_2: "Boxe Française et Savate",
    AUTRE: "",
  };
  return (ds ?? []).map((d) => map[d] ?? d).filter(Boolean).join(", ");
}

export function formuleLabel(pkg?: string | null): string {
  return pkg === "savate_prepa" ? "Savate et Prépa" : "Boxe Française";
}

// ---- Templates par défaut (auto-insérés en base s'ils sont absents) ----
export const DEFAULT_TEMPLATES: {
  nom: string;
  objet: string;
  contenu: string;
  categorie: CategorieTemplate;
}[] = [
  // ===== INFORMATIF =====
  {
    nom: "Mail de rentrée septembre",
    categorie: "informatif",
    objet: "C'est la rentrée au Punching Boxe ! 🥊",
    contenu: `Bonjour {{prenom}},

La nouvelle saison {{saison}} commence bientôt et nous avons hâte de vous retrouver sur le ring !

Les cours reprennent en septembre.
Retrouvez tous les horaires sur notre site : punching-boxe.com

À très bientôt,
Pascal et l'équipe du Punching Boxe`,
  },
  {
    nom: "Mail de fin de saison juin",
    categorie: "informatif",
    objet: "Fin de saison — Merci et à l'année prochaine ! 🥊",
    contenu: `Bonjour {{prenom}},

La saison se termine bientôt et nous tenions à vous remercier pour votre fidélité cette année.

Les inscriptions pour la saison prochaine ouvriront en juin. Restez connectés !

À l'année prochaine,
Pascal et l'équipe du Punching Boxe`,
  },
  {
    nom: "Annonce modification horaires",
    categorie: "informatif",
    objet: "📅 Modification des horaires",
    contenu: `Bonjour {{prenom}},

Nous vous informons d'une modification des horaires de cours.

[Détaillez ici les changements.]

Pour toute question, répondez simplement à cet email.

Cordialement,
Pascal et l'équipe du Punching Boxe`,
  },
  {
    nom: "Fermeture pendant les vacances scolaires",
    categorie: "informatif",
    objet: "🗓️ Pas de cours pendant les vacances",
    contenu: `Bonjour {{prenom}},

Petit rappel : le club sera fermé pendant les vacances scolaires, il n'y aura pas de cours sur cette période.

Les cours reprendront normalement à la fin des vacances. Profitez-en pour récupérer, et on se retrouve en pleine forme sur le ring !

Sportivement,
Pascal et l'équipe du Punching Boxe`,
  },
  {
    nom: "Événement / stage / compétition à venir",
    categorie: "informatif",
    objet: "🥊 Un événement à ne pas manquer",
    contenu: `Bonjour {{prenom}},

Un événement se prépare au club et on aimerait vous y voir !

[Précisez ici : date, lieu, type (stage, compétition, gala), horaires et modalités.]

Que vous veniez participer ou encourager, votre présence compte. Pour toute question, répondez simplement à cet email.

À très vite,
Pascal et l'équipe du Punching Boxe`,
  },

  // ===== RELANCE ADMINISTRATIVE =====
  {
    nom: "Relance certificat médical manquant",
    categorie: "relance_admin",
    objet: "⚠️ Document manquant — Certificat médical",
    contenu: `Bonjour {{prenom}},

Votre dossier d'inscription est presque complet ! Il nous manque votre certificat médical pour finaliser votre inscription.

Connectez-vous à votre espace adhérent pour le déposer en quelques clics.

{{bouton_espace}}

Merci et à bientôt,
Pascal et l'équipe du Punching Boxe`,
  },
  {
    nom: "Relance paiement espèces en attente",
    categorie: "relance_admin",
    objet: "💰 Règlement en attente — Punching Boxe",
    contenu: `Bonjour {{prenom}},

Nous n'avons pas encore reçu votre règlement de {{montant}}€ pour la saison {{saison}}.

Pensez à régler en espèces auprès du professeur lors de votre prochain cours.

À bientôt,
Pascal et l'équipe du Punching Boxe`,
  },
  {
    nom: "Relance dossier incomplet (pièce manquante)",
    categorie: "relance_admin",
    objet: "📄 Une pièce manque à votre dossier",
    contenu: `Bonjour {{prenom}},

Votre inscription est presque finalisée : il manque une pièce à votre dossier pour qu'il soit complet.

Connectez-vous à votre espace adhérent pour voir les documents manquants et les déposer en quelques clics.

{{bouton_espace}}

Merci d'avance,
Pascal et l'équipe du Punching Boxe`,
  },

  // ===== RÉINSCRIPTION =====
  {
    nom: "Mail de lancement des inscriptions",
    categorie: "reinscription",
    objet: "Les inscriptions {{saison}} sont ouvertes ! 🥊",
    contenu: `Bonjour {{prenom}},

La nouvelle saison approche, et on a une bonne nouvelle : le Punching Boxe passe au tout numérique pour vous simplifier la vie.

Fini les papiers à remplir sur place : votre inscription se fait désormais 100% en ligne, en quelques minutes, depuis votre canapé.

Vous réalisez votre inscription depuis votre espace adhérent personnel, où vous pouvez ensuite suivre vos dossiers, vos paiements et vos documents.

Vous pouvez régler comme vous le souhaitez :
- Par carte en une fois
- Par carte en plusieurs fois (paiement échelonné)
- En espèces auprès du professeur, comme avant

Vous souhaitez inscrire plusieurs personnes ? Depuis ce même espace, vous gérez les inscriptions de toute la famille : vos enfants, vos proches, plusieurs dossiers réunis au même endroit. Pas besoin de créer un compte par personne, vous suivez tout depuis le vôtre.

🥊 Et cette saison, deux formules pour trouver votre rythme :
- Boxe Française : 5 cours adultes / 4 cours enfants par semaine, la pratique et la technique du sport de combat.
- Savate & Prépa : 3 cours par semaine (un cours de Savate + deux cours de préparation physique) pour se dépenser et se renforcer.
On vous explique tout en détail sur le site.

{{bouton_inscription}}

On a hâte de vous retrouver sur le ring cette saison !

Pascal et l'équipe du Punching Boxe`,
  },
  {
    nom: "Réinscription — saison dernière",
    categorie: "reinscription",
    objet: "🥊 On vous attend pour la saison {{saison}} !",
    contenu: `Bonjour {{prenom}},

Vous étiez des nôtres la saison dernière, et on espère bien vous retrouver sur le ring cette année !

Les inscriptions pour la saison {{saison}} sont ouvertes. La réinscription se fait désormais en ligne, en quelques minutes, depuis votre espace adhérent : paiement en une ou plusieurs fois, ou en espèces auprès du professeur, comme vous préférez.

{{bouton_inscription}}

Au plaisir de vous revoir,
Pascal et l'équipe du Punching Boxe`,
  },
  {
    nom: "Réinscription — tièdes",
    categorie: "reinscription",
    objet: "🥊 Votre place vous attend pour la saison {{saison}}",
    contenu: `Bonjour {{prenom}},

Cela fait quelque temps qu'on ne vous a pas vu au club, et on aimerait beaucoup vous retrouver pour la saison {{saison}}.

L'inscription se fait désormais en ligne, en quelques minutes, depuis votre espace adhérent : paiement par carte (en une ou plusieurs fois) ou en espèces auprès du professeur.

Bon à savoir : votre absence étant récente, vous n'avez pas de frais d'adhésion à repayer cette saison, seulement votre cotisation.

Et si vous préférez reprendre tranquillement, venez quand vous voulez faire une séance d'essai à l'un de nos cours, le temps de retrouver vos sensations avant de vous réinscrire. Les horaires sont sur notre site.

{{bouton_inscription}}

On garde votre place au chaud,
Pascal et l'équipe du Punching Boxe`,
  },

  // ===== RÉACTIVATION =====
  {
    nom: "Réactivation — anciens (revenez au club)",
    categorie: "reactivation",
    objet: "🥊 Et si vous repreniez la boxe ?",
    contenu: `Bonjour {{prenom}},

Cela fait un moment qu'on ne vous a pas croisé au club (votre dernière saison remonte à {{derniere_saison}}). Le Punching Boxe a évolué depuis, et on serait ravis de vous revoir sur le ring.

Tout est désormais en ligne : vous pouvez vous réinscrire en quelques minutes depuis votre espace adhérent, régler par carte (en une ou plusieurs fois) ou en espèces auprès du professeur.

Et pas de pression : vous pouvez passer quand vous voulez faire une séance d'essai à l'un de nos cours pour vous remettre en jambes, avant de décider. Retrouvez tous les horaires sur notre site.

{{bouton_inscription}}

À très bientôt, on l'espère,
Pascal et l'équipe du Punching Boxe`,
  },
];
