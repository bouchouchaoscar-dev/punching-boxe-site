import type { ModePaiement, PackageType, TypeAdherent } from "./pricing";

export type StatutPaiement =
  | "en_attente"
  | "paye"
  | "confirme_especes"
  | "echec_paiement";

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
  // Stripe / échéances
  stripe_customer_id: string | null;
  stripe_setup_intent_id: string | null;
  nb_echeances: number;
  echeances_payees: number;
  prochaine_echeance: string | null;
  derniere_erreur_stripe: string | null;
}

export type NewAdherent = Omit<Adherent, "id" | "created_at">;

export type StatutPaiementEcheance = "en_attente" | "paye" | "echec";

export interface Paiement {
  id: string;
  adherent_id: string;
  stripe_payment_intent_id: string | null;
  montant: number;
  statut: StatutPaiementEcheance;
  numero_echeance: number | null;
  date_prevue: string | null;
  date_paiement: string | null;
  created_at: string;
}
