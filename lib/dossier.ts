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
