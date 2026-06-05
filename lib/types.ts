import type { ModePaiement, PackageType, TypeAdherent } from "./pricing";

export type StatutPaiement = "en_attente" | "paye" | "confirme_especes";

export interface Adherent {
  id: string;
  created_at: string;
  nom: string;
  prenom: string;
  date_naissance: string;
  email: string;
  telephone: string | null;
  adresse: string | null;
  ville: string | null;
  code_postal: string | null;
  type_adherent: TypeAdherent;
  package: PackageType;
  nouveau_membre: boolean;
  option_prepa_physique: boolean;
  nb_membres_famille: number;
  montant_total: number;
  mode_paiement: ModePaiement;
  statut_paiement: StatutPaiement;
  stripe_payment_intent_id: string | null;
  saison: string;
  photo_url: string | null;
  fiche_inscription_url: string | null;
  certificat_medical_url: string | null;
  reglement_url: string | null;
  documents_valides: boolean;
  motif_refus_doc: string | null;
  fiche_valide: boolean;
  certificat_valide: boolean;
  reglement_valide: boolean;
  photo_valide: boolean;
  fiche_motif_refus: string | null;
  certificat_motif_refus: string | null;
  reglement_motif_refus: string | null;
  photo_motif_refus: string | null;
}

export type NewAdherent = Omit<Adherent, "id" | "created_at">;
