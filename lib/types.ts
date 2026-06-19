import type { ModePaiement, PackageType, TypeAdherent } from "./pricing";
import type { LienParente } from "./inscription";

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
  // Code Stripe brut du dernier échec (decline_code, à défaut code) pour brancher
  // le parcours différencié (provision / carte morte / autre).
  derniere_erreur_code: string | null;
  // Badge "Nouveau" : passe à true dès que l'admin ouvre la fiche.
  vu_par_admin: boolean;
  // Refonte "1 compte = N adhérents" : compte titulaire + lien de parenté.
  titulaire_id: string | null;
  lien_parente: LienParente | null;
  // Moment d'engagement (1er paiement passé) : posé une seule fois, sinon null.
  engage_at: string | null;
  // Ancienneté : clé de matching + lien vers l'ancien importé (1 match ferme)
  // + flag d'ambiguïté (≥2 candidats, résolution admin en phase 2).
  match_key: string | null;
  ancien_id: string | null;
  match_a_verifier: boolean;
  // Remboursements / litiges (reflet de Stripe) + annulation d'inscription.
  // Optionnels : valeurs par défaut en base, non posées à l'insertion.
  montant_rembourse?: number;
  rembourse_at?: string | null;
  litige?: boolean;
  litige_statut?: string | null; // 'ouvert' | 'gagne' | 'perdu'
  annule_at?: string | null;
  // Foyer élargi (rattachement de comptes séparés). NULL = foyer = titulaire_id
  // (comportement groupé historique). + trace de l'attestation sur l'honneur.
  foyer_id?: string | null;
  attestation_foyer_at?: string | null;
  // Signature en ligne (fiche + règlement générés) : horodatage + IP (trace).
  fiche_signee_at?: string | null;
  reglement_signee_at?: string | null;
  signature_ip?: string | null;
  // Mail « dossier complet et validé » envoyé une seule fois (anti-doublon).
  mail_dossier_complet_envoye?: boolean;
  // Relance « panier abandonné » envoyée une seule fois (horodatage = flag).
  relance_panier_envoyee_at?: string | null;
}

export type NewAdherent = Omit<Adherent, "id" | "created_at">;

export type StatutPaiementEcheance =
  | "en_attente"
  | "en_cours" // claim du cron (transitoire, avant débit)
  | "paye"
  | "echec"
  | "rembourse"
  | "annule";

export interface Paiement {
  id: string;
  adherent_id: string;
  stripe_payment_intent_id: string | null;
  montant: number;
  montant_rembourse: number;
  statut: StatutPaiementEcheance;
  numero_echeance: number | null;
  date_prevue: string | null;
  date_paiement: string | null;
  created_at: string;
}
