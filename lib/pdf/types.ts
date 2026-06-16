import type { PackageType } from "@/lib/pricing";

// Signature dessinée, capturée en VECTEUR (traits de points) → rendue en SVG
// dans le PDF (net, pas de base64/raster). viewBox = width × height.
export type SignatureVect = {
  width: number;
  height: number;
  strokes: { x: number; y: number }[][];
};

// Données pour générer la FICHE d'inscription remplie + signée.
export type FicheData = {
  nom: string;
  prenom: string;
  dateNaissance: string; // ISO yyyy-mm-dd
  telephone: string;
  email: string;
  adresse: string;
  codePostal: string;
  ville: string;
  packageType: PackageType;
  optionPrepa: boolean;
  typeAdherent: "adulte" | "jeune";
  montantTotal: number;
  // Adhésion-club (30€) réellement comptée dans le total (nouveau / ancien
  // éloigné) → pilote le marquage rond/croix sur la fiche générée.
  adhesionDue?: boolean;
  // Mineur : autorisation parentale (signée par le responsable légal).
  mineur: boolean;
  responsable?: string | null;
  autorisationMedicale?: boolean;
  contacts?: { nom: string; tel: string }[];
  signature?: SignatureVect | null;
  dateSignature?: string | null; // ISO
};

// Données pour générer le RÈGLEMENT intérieur signé.
// Mineur : c'est le RESPONSABLE LÉGAL qui s'engage et signe (un mineur ne peut
// pas s'engager seul). La signature reste celle saisie (titulaire = responsable).
export type ReglementData = {
  nom: string;
  prenom: string;
  mineur?: boolean;
  responsable?: string | null;
  signature?: SignatureVect | null;
  dateSignature?: string | null;
};
