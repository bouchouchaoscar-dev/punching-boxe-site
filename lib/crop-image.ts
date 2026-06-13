// Recadrage d'image côté client (photo de profil). Dessine la zone choisie
// dans un canvas carré et exporte un JPEG compact. Aucune dépendance serveur.

export type Area = { x: number; y: number; width: number; height: number };

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("Image illisible"));
    img.src = src;
  });
}

/**
 * Recadre `imageSrc` selon la zone `area` (en pixels de l'image source) et
 * renvoie un Blob JPEG carré de `size`×`size` (par défaut 600, qualité 0.9).
 */
export async function cropToBlob(
  imageSrc: string,
  area: Area,
  size = 600,
  quality = 0.9,
): Promise<Blob> {
  const img = await loadImage(imageSrc);
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas non disponible");
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(
    img,
    area.x,
    area.y,
    area.width,
    area.height,
    0,
    0,
    size,
    size,
  );
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (b) => (b ? resolve(b) : reject(new Error("Échec du recadrage"))),
      "image/jpeg",
      quality,
    );
  });
}
