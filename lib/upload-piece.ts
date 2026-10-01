// SOURCE UNIQUE de validation des pièces déposées (inscription, espace adhérent,
// « compléter »). Validation par MAGIC BYTES (contenu réel), JAMAIS par file.type
// ni l'extension (le client peut mentir). Liste blanche stricte par champ.
//
// Certificat médical : PDF + photos (JPEG, PNG, WebP, HEIC/HEIF) — le papier signé
// par le médecin est souvent photographié depuis un téléphone. Fiche & règlement
// restent PDF (générés par React-PDF, jamais photographiés). Photo d'identité
// garde son parcours de recadrage (JPEG/PNG), inchangée.

export const CHAMPS_PIECE = ["fiche_inscription", "certificat_medical", "reglement", "photo"] as const;
export type ChampPiece = (typeof CHAMPS_PIECE)[number];

export type TypePiece = "pdf" | "jpg" | "png" | "webp" | "heic";

// Extension + Content-Type imposés par le type SNIFFÉ (source de vérité unique).
export const TYPE_META: Record<TypePiece, { ext: string; contentType: string }> = {
  pdf: { ext: "pdf", contentType: "application/pdf" },
  jpg: { ext: "jpg", contentType: "image/jpeg" },
  png: { ext: "png", contentType: "image/png" },
  webp: { ext: "webp", contentType: "image/webp" },
  heic: { ext: "heic", contentType: "image/heic" },
};

// Types réellement acceptés par champ (déduits du CONTENU).
export const ACCEPTS: Record<ChampPiece, TypePiece[]> = {
  fiche_inscription: ["pdf"],
  reglement: ["pdf"],
  certificat_medical: ["pdf", "jpg", "png", "webp", "heic"],
  photo: ["jpg", "png"],
};

// Limites serveur : une photo de téléphone (HEIC non converti côté client) peut
// être lourde → plafond image généreux ; PDF plus serré (scans/générés).
const MAX_IMAGE = 15 * 1024 * 1024; // 15 Mo
const MAX_PDF = 10 * 1024 * 1024; // 10 Mo

// Détection par signature binaire (magic bytes). Serveur uniquement.
export function sniffType(buf: Buffer | Uint8Array): TypePiece | null {
  const b = buf;
  if (b.length >= 5 && b[0] === 0x25 && b[1] === 0x50 && b[2] === 0x44 && b[3] === 0x46 && b[4] === 0x2d)
    return "pdf"; // "%PDF-"
  if (b.length >= 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return "jpg"; // FF D8 FF
  if (
    b.length >= 8 &&
    b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47 &&
    b[4] === 0x0d && b[5] === 0x0a && b[6] === 0x1a && b[7] === 0x0a
  ) return "png"; // 89 50 4E 47 0D 0A 1A 0A
  // WebP : "RIFF"...."WEBP"
  if (
    b.length >= 12 &&
    b[0] === 0x52 && b[1] === 0x49 && b[2] === 0x46 && b[3] === 0x46 &&
    b[8] === 0x57 && b[9] === 0x45 && b[10] === 0x42 && b[11] === 0x50
  ) return "webp";
  // HEIC/HEIF : ISO-BMFF, "ftyp" à l'offset 4 + marque connue à l'offset 8.
  if (b.length >= 12 && b[4] === 0x66 && b[5] === 0x74 && b[6] === 0x79 && b[7] === 0x70) {
    const marque = String.fromCharCode(b[8], b[9], b[10], b[11]).toLowerCase();
    const HEIF = ["heic", "heix", "hevc", "hevx", "heim", "heis", "hevm", "hevs", "mif1", "msf1", "heif"];
    if (HEIF.includes(marque)) return "heic";
  }
  return null;
}

export function estImage(t: TypePiece): boolean {
  return t !== "pdf";
}

// Message de rejet clair (français) selon ce que le champ accepte vraiment.
export function messageRefus(field: ChampPiece): string {
  const a = ACCEPTS[field];
  if (a.length === 1 && a[0] === "pdf") return "Un fichier PDF est attendu.";
  if (field === "photo") return "Une image JPG ou PNG est attendue.";
  return "Fichier non reconnu : un PDF ou une photo (JPG, PNG, WebP, HEIC) est attendu.";
}

export type ResultatValidation =
  | { ok: true; type: TypePiece; ext: string; contentType: string }
  | { ok: false; status: number; error: string };

/**
 * Valide une pièce par son CONTENU et sa taille. Message humain si trop lourd
 * (distinct photo / PDF). Ne lit jamais file.type ni l'extension.
 */
export function validerPiece(field: ChampPiece, buffer: Buffer | Uint8Array): ResultatValidation {
  if (buffer.length === 0) return { ok: false, status: 400, error: "Fichier vide." };
  const type = sniffType(buffer);
  if (!type || !ACCEPTS[field].includes(type)) {
    return { ok: false, status: 415, error: messageRefus(field) };
  }
  const image = estImage(type);
  const max = image ? MAX_IMAGE : MAX_PDF;
  if (buffer.length > max) {
    return {
      ok: false,
      status: 413,
      error: image
        ? "Photo trop lourde, réessayez ou prenez-la de plus près."
        : `Fichier trop volumineux (max ${Math.round(MAX_PDF / (1024 * 1024))} Mo).`,
    };
  }
  const { ext, contentType } = TYPE_META[type];
  return { ok: true, type, ext, contentType };
}
