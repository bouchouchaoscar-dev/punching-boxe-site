import type { Adherent } from "./types";

// Statut global du dossier de documents d'un adhérent.
// - "valide"     : les 4 documents sont validés (dont le certificat médical)
// - "presque"    : les 3 obligatoires (fiche + règlement + photo) sont validés,
//                   il ne manque que le certificat médical
// - "incomplet"  : au moins un document OBLIGATOIRE est manquant ou non validé
export type DossierStatut = "valide" | "presque" | "incomplet";

type DocsSource = Pick<
  Adherent,
  | "fiche_valide"
  | "reglement_valide"
  | "photo_valide"
  | "certificat_valide"
  | "certificat_medical_url"
>;

export interface DossierEtat {
  statut: DossierStatut;
  valides: number; // nombre de documents validés (0–4)
  total: number; // toujours 4
  obligatoiresOk: boolean; // fiche + règlement + photo validés
  certificatOk: boolean; // certificat médical présent ET validé
  /** Valeur à stocker dans la colonne adherents.documents_valides (= 4/4). */
  documentsValides: boolean;
}

// Évalue le dossier à partir des seuls champs *_valide (+ présence du certificat).
// Source de vérité unique utilisée par l'espace adhérent, la liste admin,
// la fiche admin et l'API (dérivation de documents_valides).
export function evaluerDossier(a: DocsSource): DossierEtat {
  const fiche = !!a.fiche_valide;
  const reglement = !!a.reglement_valide;
  const photo = !!a.photo_valide;
  const certificatOk = !!a.certificat_valide && !!a.certificat_medical_url;

  const obligatoiresOk = fiche && reglement && photo;
  const valides = [fiche, reglement, photo, certificatOk].filter(Boolean).length;

  let statut: DossierStatut;
  if (!obligatoiresOk) statut = "incomplet";
  else if (!certificatOk) statut = "presque";
  else statut = "valide";

  return {
    statut,
    valides,
    total: 4,
    obligatoiresOk,
    certificatOk,
    documentsValides: statut === "valide",
  };
}

// ───────── Vue ADHÉRENT (espace client) : badge gradient + nommage ─────────
// Plus fin que `evaluerDossier` : distingue ce que le MEMBRE doit encore
// fournir (manquant/refusé) de ce qui est déposé en attente de validation, et
// traite le certificat médical comme NON bloquant (cohérent avec l'upload).

// État d'une pièce du point de vue du membre.
export type DocEtat = "manquant" | "refus" | "attente" | "valide";

export function docEtat(
  a: Adherent,
  base: string,
  urlKey: keyof Adherent,
): DocEtat {
  const refus = a[`${base}_motif_refus` as keyof Adherent] as string | null;
  const url = a[urlKey] as string | null;
  const valide = !!a[`${base}_valide` as keyof Adherent];
  if (refus) return "refus";
  if (!url) return "manquant";
  return valide ? "valide" : "attente";
}

// Tons du badge adhérent (du plus rassurant au plus urgent).
export type DossierTon =
  | "complet" // 4/4 validées
  | "inscription_ok" // 3 obligatoires validées, seul le certificat manque (non bloquant)
  | "verification" // tout déposé, validation admin en cours
  | "presque" // il ne reste qu'1 pièce OBLIGATOIRE à fournir
  | "incomplet"; // 2+ pièces obligatoires à fournir, refus, ou rien commencé

export interface BadgeAdherent {
  ton: DossierTon;
  label: string;
}

const OBLIG_ADH: { base: string; url: keyof Adherent; label: string }[] = [
  { base: "fiche", url: "fiche_inscription_url", label: "la fiche d'inscription" },
  { base: "reglement", url: "reglement_url", label: "le règlement intérieur" },
  { base: "photo", url: "photo_url", label: "la photo d'identité" },
];

// Majuscule en tête de phrase (les labels sont en minuscule avec article).
const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

export function badgeDossierAdherent(a: Adherent): BadgeAdherent {
  const oblig = OBLIG_ADH.map((o) => ({ ...o, etat: docEtat(a, o.base, o.url) }));
  const certEtat = docEtat(a, "certificat", "certificat_medical_url");

  // Une pièce obligatoire refusée prime (à corriger) → rouge, alignée sur la
  // synthèse qui passe en "danger".
  const refusee = oblig.find((o) => o.etat === "refus");
  if (refusee)
    return { ton: "incomplet", label: `🔴 ${cap(refusee.label)} à corriger` };

  const aFournir = oblig.filter((o) => o.etat === "manquant");
  if (aFournir.length >= 2)
    return {
      ton: "incomplet",
      label: `🔴 ${aFournir.length} pièces obligatoires à fournir`,
    };
  if (aFournir.length === 1)
    return { ton: "presque", label: `🟠 Il ne reste que ${aFournir[0].label}` };

  // Plus rien à fournir côté obligatoires.
  const obligValidees = oblig.every((o) => o.etat === "valide");
  if (!obligValidees)
    return { ton: "verification", label: "⏳ Pièces en cours de vérification" };
  if (certEtat === "valide") return { ton: "complet", label: "🟢 Dossier complet" };
  return {
    ton: "inscription_ok",
    label: "🟢 Inscription validée · certificat à fournir",
  };
}
