"use client";

// Compression d'image CÔTÉ CLIENT avant envoi d'une pièce justificative
// (certificat médical photographié). Redimensionne (côté long ~2000 px, large
// marge de lisibilité pour un certificat) et ré-encode en JPEG qualité ~0,85 via
// canvas → une photo de 3–12 Mo tombe en général sous 1 Mo. Décode aussi le HEIC
// quand le navigateur sait le dessiner (iPhone/Safari). Si le décodage échoue
// (HEIC non supporté), renvoie null → l'appelant envoie le fichier original, que
// le serveur acceptera tel quel (validé par magic bytes).

const COTE_MAX = 2000;
const QUALITE = 0.85;

// Reconnaît un fichier image candidat à la compression (type MIME OU extension,
// car le HEIC n'a pas toujours un type renseigné selon le navigateur).
export function estImagePiece(file: File): boolean {
  if (file.type && file.type.startsWith("image/")) return true;
  return /\.(jpe?g|png|webp|heic|heif)$/i.test(file.name);
}

export async function compresserImage(
  file: File,
  coteMax = COTE_MAX,
  qualite = QUALITE,
): Promise<Blob | null> {
  try {
    if (typeof document === "undefined") return null;
    const url = URL.createObjectURL(file);
    try {
      const img = await new Promise<HTMLImageElement>((resolve, reject) => {
        const i = new Image();
        i.onload = () => resolve(i);
        i.onerror = () => reject(new Error("decode"));
        i.src = url;
      });
      const w0 = img.naturalWidth || img.width;
      const h0 = img.naturalHeight || img.height;
      if (!w0 || !h0) return null;
      const echelle = Math.min(1, coteMax / Math.max(w0, h0));
      const w = Math.round(w0 * echelle);
      const h = Math.round(h0 * echelle);
      const canvas = document.createElement("canvas");
      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext("2d");
      if (!ctx) return null;
      ctx.drawImage(img, 0, 0, w, h);
      const blob = await new Promise<Blob | null>((r) => canvas.toBlob(r, "image/jpeg", qualite));
      return blob && blob.size > 0 ? blob : null;
    } finally {
      URL.revokeObjectURL(url);
    }
  } catch {
    return null; // décodage impossible → l'appelant enverra l'original
  }
}

// Prépare une pièce pour l'envoi : compresse si c'est une image décodable, sinon
// renvoie le fichier original. Renvoie toujours { blob, name } prêts à envoyer.
export async function preparerPiece(file: File): Promise<{ blob: Blob; name: string }> {
  if (!estImagePiece(file)) return { blob: file, name: file.name };
  const compresse = await compresserImage(file);
  if (!compresse) return { blob: file, name: file.name };
  const base = file.name.replace(/\.[^.]+$/, "") || "piece";
  return { blob: compresse, name: `${base}.jpg` };
}
