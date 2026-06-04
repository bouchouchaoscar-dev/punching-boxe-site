import type { ModePaiement, TypeAdherent } from "./pricing";

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
}

export type NewAdherent = Omit<Adherent, "id" | "created_at">;
