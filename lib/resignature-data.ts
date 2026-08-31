import type { Adherent } from "./types";
import type { FicheData, ReglementData } from "./pdf/types";
import type { ResignDoc } from "./resignature-link";
import { remiseFamillePct } from "./pricing";

// Reconstruction des données d'aperçu pour la re-signature, DEPUIS LA BASE
// (le nom est toujours autoritaire côté serveur, jamais pris du client).
// Module serveur (utilisé par la page /re-signer et, plus tard, le lot 4).

/** Mineur = moins de 18 ans à la date de référence. */
export function estMineurISO(dateNaissanceISO: string, ref = new Date()): boolean {
  const d = new Date(dateNaissanceISO);
  let age = ref.getFullYear() - d.getFullYear();
  const m = ref.getMonth() - d.getMonth();
  if (m < 0 || (m === 0 && ref.getDate() < d.getDate())) age--;
  return age < 18;
}

/**
 * Construit les données d'APERÇU (signature null) pour les documents demandés.
 * - Règlement : reconstruit à l'identique (nom/prénom/mineur/responsable).
 * - Fiche : reconstruite SAUF les champs jamais persistés à l'inscription
 *   (contacts d'urgence, autorisation médicale) → à trancher au lot 4b.
 * `responsable` provient de la base (null tant qu'il n'a pas été re-saisi).
 */
export function construirePayloadsResignature(
  a: Adherent,
  docs: ResignDoc[],
): { fiche: FicheData | null; reglement: ReglementData | null; mineur: boolean } {
  const mineur = estMineurISO(a.date_naissance);
  const responsable = a.responsable ?? null;

  const reglement: ReglementData | null = docs.includes("reglement")
    ? {
        nom: a.nom,
        prenom: a.prenom,
        mineur,
        responsable,
        signature: null,
        dateSignature: null,
      }
    : null;

  const fiche: FicheData | null = docs.includes("fiche")
    ? {
        nom: a.nom,
        prenom: a.prenom,
        dateNaissance: a.date_naissance,
        telephone: a.telephone ?? "",
        email: a.email,
        adresse: a.adresse ?? "",
        codePostal: a.code_postal ?? "",
        ville: a.ville ?? "",
        packageType: a.package,
        optionPrepa: a.option_prepa_physique,
        typeAdherent: a.type_adherent,
        montantTotal: a.montant_total,
        adhesionDue: a.nouveau_membre,
        remisePct: remiseFamillePct(a.nb_membres_famille),
        mineur,
        responsable,
        // ⚠️ NON persistés à l'inscription (à traiter au lot 4b) :
        autorisationMedicale: mineur ? true : undefined,
        contacts: [],
        signature: null,
        dateSignature: null,
      }
    : null;

  return { fiche, reglement, mineur };
}
