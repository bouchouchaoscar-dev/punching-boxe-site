import { calculerTarif, type ModePaiement } from "./pricing";
import { CLUB } from "./constants";
import type { NewAdherent } from "./types";

/** Données envoyées par le formulaire d'inscription. */
export interface InscriptionPayload {
  nom: string;
  prenom: string;
  date_naissance: string;
  email: string;
  telephone?: string;
  adresse?: string;
  ville?: string;
  code_postal?: string;
  nouveau_membre: boolean;
  option_prepa_physique: boolean;
  nb_membres_famille: number;
  mode_paiement: ModePaiement;
  photo_url?: string | null;
  fiche_inscription_url?: string | null;
  certificat_medical_url?: string | null;
  reglement_url?: string | null;
}

export function validatePayload(p: Partial<InscriptionPayload>): string | null {
  if (!p.nom?.trim()) return "Le nom est requis.";
  if (!p.prenom?.trim()) return "Le prénom est requis.";
  if (!p.date_naissance) return "La date de naissance est requise.";
  if (!p.email?.trim() || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(p.email))
    return "Un email valide est requis.";
  const modes: ModePaiement[] = [
    "stripe_1x",
    "stripe_2x",
    "stripe_3x",
    "stripe_4x",
    "especes",
  ];
  if (!p.mode_paiement || !modes.includes(p.mode_paiement))
    return "Mode de paiement invalide.";
  return null;
}

/**
 * Construit l'enregistrement adhérent en RECALCULANT le tarif côté serveur.
 * Le total envoyé par le client n'est jamais utilisé.
 */
export function buildAdherentInsert(
  p: InscriptionPayload,
  statut: NewAdherent["statut_paiement"] = "en_attente",
): NewAdherent {
  const tarif = calculerTarif({
    dateNaissance: p.date_naissance,
    nouveauMembre: p.nouveau_membre,
    optionPrepaPhysique: p.option_prepa_physique,
    nbMembresFamille: p.nb_membres_famille,
  });

  return {
    nom: p.nom.trim(),
    prenom: p.prenom.trim(),
    date_naissance: p.date_naissance,
    email: p.email.trim().toLowerCase(),
    telephone: p.telephone?.trim() || null,
    adresse: p.adresse?.trim() || null,
    ville: p.ville?.trim() || null,
    code_postal: p.code_postal?.trim() || null,
    type_adherent: tarif.typeAdherent,
    nouveau_membre: !!p.nouveau_membre,
    option_prepa_physique: !!p.option_prepa_physique,
    nb_membres_famille: Number(p.nb_membres_famille) || 0,
    montant_total: tarif.total,
    mode_paiement: p.mode_paiement,
    statut_paiement: statut,
    stripe_payment_intent_id: null,
    saison: CLUB.saison,
    photo_url: p.photo_url || null,
    fiche_inscription_url: p.fiche_inscription_url || null,
    certificat_medical_url: p.certificat_medical_url || null,
    reglement_url: p.reglement_url || null,
  };
}
