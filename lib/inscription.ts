import { calculerTarif, type ModePaiement, type PackageType } from "./pricing";
import { saisonCourante, estJuin, saisonQuiSeTermine } from "./saison";
import { matchKey } from "./anciennete";
import type { NewAdherent } from "./types";
import type { FicheData, ReglementData } from "./pdf/types";

/** Lien du dossier avec le titulaire du compte (refonte "1 compte = N adhérents"). */
export type LienParente = "moi" | "enfant" | "frere_soeur" | "conjoint" | "autre";
export const LIENS_PARENTE: LienParente[] = [
  "moi",
  "enfant",
  "frere_soeur",
  "conjoint",
  "autre",
];

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
  package: PackageType;
  nouveau_membre: boolean;
  option_prepa_physique: boolean;
  nb_membres_famille: number;
  mode_paiement: ModePaiement;
  lien_parente: LienParente;
  // Intention (juin) de s'inscrire pour la saison qui se termine plutôt que la
  // suivante. La VALEUR de saison est calculée serveur, jamais reçue du client.
  saison_en_cours?: boolean;
  photo_url?: string | null;
  fiche_inscription_url?: string | null;
  certificat_medical_url?: string | null;
  reglement_url?: string | null;
  // Rattachement famille (comptes séparés) : membres déjà inscrits cités par
  // nom + prénom + naissance (jamais l'email). Le serveur résout + relie.
  rattachements?: { nom?: string; prenom?: string; date_naissance?: string }[];
  // Attestation sur l'honneur du foyer (cochée côté client avant validation).
  attestation_foyer?: boolean;
  // Génération serveur des documents signés (fiche + règlement) : le client
  // envoie le dossier de stockage + les DONNÉES (avec signatures), le serveur
  // rend + dépose + remplit fiche_inscription_url / reglement_url AVANT l'insert
  // (génération garantie, parallélisée). Anciens clients (URLs directes) restent
  // tolérés via fiche_inscription_url / reglement_url.
  adherentId?: string;
  doc_fiche?: FicheData;
  doc_reglement?: ReglementData;
}

/** IP du client (derrière le proxy Vercel) pour la trace de signature. */
export function clientIp(request: Request): string | null {
  const fwd = request.headers.get("x-forwarded-for");
  if (fwd) return fwd.split(",")[0].trim();
  return request.headers.get("x-real-ip");
}

export function validatePayload(p: Partial<InscriptionPayload>): string | null {
  if (!p.nom?.trim()) return "Le nom est requis.";
  if (!p.prenom?.trim()) return "Le prénom est requis.";
  if (!p.date_naissance) return "La date de naissance est requise.";
  if (!p.email?.trim() || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(p.email))
    return "Un email valide est requis.";
  if (!p.telephone?.trim()) return "Le téléphone est requis.";
  if (!p.adresse?.trim()) return "L'adresse postale est requise.";
  if (!p.code_postal?.trim()) return "Le code postal est requis.";
  if (!p.ville?.trim()) return "La ville est requise.";
  const packages: PackageType[] = ["boxe_classique", "savate_prepa"];
  if (!p.package || !packages.includes(p.package))
    return "Formule (package) invalide.";
  const modes: ModePaiement[] = [
    "stripe_1x",
    "stripe_2x",
    "stripe_3x",
    "stripe_4x",
    "especes",
  ];
  if (!p.mode_paiement || !modes.includes(p.mode_paiement))
    return "Mode de paiement invalide.";
  if (!p.lien_parente || !LIENS_PARENTE.includes(p.lien_parente))
    return "Précisez qui concerne ce dossier (vous, enfant, frère/sœur, conjoint·e, autre).";
  return null;
}

/**
 * Construit l'enregistrement adhérent en RECALCULANT le tarif côté serveur.
 * Le total envoyé par le client n'est jamais utilisé.
 */
export function buildAdherentInsert(
  p: InscriptionPayload,
  statut: NewAdherent["statut_paiement"] = "en_attente",
  // UUID du compte titulaire (auth.users.id), résolu CÔTÉ SERVEUR uniquement.
  titulaireId: string | null = null,
): NewAdherent {
  // Saison + bascule "saison en cours" (juin uniquement), calculées SERVEUR.
  // Le même drapeau pilote l'attribution de saison ET le prorata (juin = 2 mois).
  const now = new Date();
  const saisonEnCours = !!p.saison_en_cours && estJuin(now);
  const saison = saisonEnCours ? saisonQuiSeTermine(now) : saisonCourante(now);

  const tarif = calculerTarif(
    {
      dateNaissance: p.date_naissance,
      packageType: p.package,
      nouveauMembre: p.nouveau_membre,
      optionPrepaPhysique: p.option_prepa_physique,
      nbMembresFamille: p.nb_membres_famille,
    },
    now,
    saisonEnCours,
  );

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
    package: p.package,
    nouveau_membre: !!p.nouveau_membre,
    // En Savate & Prépa, la prépa physique est toujours incluse.
    option_prepa_physique:
      p.package === "savate_prepa" ? true : !!p.option_prepa_physique,
    nb_membres_famille: Number(p.nb_membres_famille) || 0,
    montant_total: tarif.total,
    mode_paiement: p.mode_paiement,
    statut_paiement: statut,
    titulaire_id: titulaireId,
    lien_parente: p.lien_parente,
    engage_at: null,
    // Clé de matching déterministe (les routes posent ancien_id / match_a_verifier
    // après l'évaluation serveur de l'ancienneté).
    match_key: matchKey(p.nom, p.prenom, p.date_naissance),
    ancien_id: null,
    match_a_verifier: false,
    stripe_payment_intent_id: null,
    saison,
    photo_url: p.photo_url || null,
    fiche_inscription_url: p.fiche_inscription_url || null,
    certificat_medical_url: p.certificat_medical_url || null,
    reglement_url: p.reglement_url || null,
    documents_valides: false,
    motif_refus_doc: null,
    fiche_valide: false,
    certificat_valide: false,
    reglement_valide: false,
    photo_valide: false,
    fiche_motif_refus: null,
    certificat_motif_refus: null,
    reglement_motif_refus: null,
    photo_motif_refus: null,
    stripe_customer_id: null,
    stripe_setup_intent_id: null,
    nb_echeances: 1,
    echeances_payees: 0,
    prochaine_echeance: null,
    derniere_erreur_stripe: null,
    derniere_erreur_code: null,
    vu_par_admin: false,
  };
}

// Colonnes issues de migrations (validation des documents + Stripe/échéances).
// Si la base n'a pas encore reçu ces migrations, l'insert les retire pour
// ne pas échouer (les DEFAULT seront pris une fois les colonnes créées).
export const OPTIONAL_DOC_COLUMNS = [
  "documents_valides",
  "motif_refus_doc",
  "fiche_valide",
  "certificat_valide",
  "reglement_valide",
  "photo_valide",
  "fiche_motif_refus",
  "certificat_motif_refus",
  "reglement_motif_refus",
  "photo_motif_refus",
  "stripe_customer_id",
  "stripe_setup_intent_id",
  "nb_echeances",
  "echeances_payees",
  "prochaine_echeance",
  "derniere_erreur_stripe",
  "derniere_erreur_code",
  "vu_par_admin",
  "engage_at",
  "match_key",
  "ancien_id",
  "match_a_verifier",
  "foyer_id",
  "attestation_foyer_at",
  "fiche_signee_at",
  "reglement_signee_at",
  "signature_ip",
] as const;
