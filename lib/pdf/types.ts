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
  // Mineur : autorisation parentale (signée par le responsable légal).
  mineur: boolean;
  responsable?: string | null;
  autorisationMedicale?: boolean;
  contacts?: { nom: string; tel: string }[];
  signature?: SignatureVect | null;
  dateSignature?: string | null; // ISO
};

// Données pour générer le RÈGLEMENT intérieur signé.
export type ReglementData = {
  nom: string;
  prenom: string;
  signature?: SignatureVect | null;
  dateSignature?: string | null;
};
