// Affiche Présence (QR) : doit tenir sur EXACTEMENT 1 page A4 — pour une salle
// ET pour le QR générique. Exécuter : npx tsx scripts/test-affiche-qr.mts
import { renderToBuffer } from "@react-pdf/renderer";
import { AfficheQRDoc } from "../lib/pdf/AfficheQR";

let ok = 0, ko = 0;
const check = (l: string, c: boolean, g?: unknown) => {
  if (c) { ok++; console.log(`  ✓ ${l}`); }
  else { ko++; console.log(`  ✗ ${l}` + (g !== undefined ? `  → ${JSON.stringify(g)}` : "")); }
};

// 1×1 PNG transparent (placeholder QR : le rendu/pagination ne dépend pas du
// contenu de l'image, seulement de sa boîte de 250×250).
const QR = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAAC0lEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==";

// Nombre de pages du PDF : compte les objets « /Type /Page » (hors « /Pages »).
function nbPages(buf: Buffer): number {
  const txt = buf.toString("latin1");
  const m = txt.match(/\/Type\s*\/Page(?![s])/g);
  return m ? m.length : 0;
}

const bufSalle = await renderToBuffer(AfficheQRDoc({ data: { salle: "Salle de Nogent-sur-Marne", qrDataUri: QR } }));
const bufGenerique = await renderToBuffer(AfficheQRDoc({ data: { salle: null, qrDataUri: QR } }));

check("affiche d'une salle → exactement 1 page", nbPages(bufSalle) === 1, nbPages(bufSalle));
check("affiche générique (sans salle) → exactement 1 page", nbPages(bufGenerique) === 1, nbPages(bufGenerique));
check("PDF salle non vide", bufSalle.length > 1000, bufSalle.length);
check("PDF générique non vide", bufGenerique.length > 1000, bufGenerique.length);

// Garde-fou structurel : wrap={false} présent dans le composant (empêche le
// basculement d'une ligne isolée sur une 2e page).
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
const src = readFileSync(join(dirname(fileURLToPath(import.meta.url)), "../lib/pdf/AfficheQR.tsx"), "utf8");
check("Page wrap={false} (pas de pagination)", /<Page[^>]*wrap=\{false\}/.test(src));
check("conteneur à hauteur maîtrisée wrap={false}", src.includes("height: \"100%\"") && /<View style=\{s\.contenu\} wrap=\{false\}/.test(src));

console.log(`\nRésultat : ${ok} OK / ${ko} KO`);
process.exit(ko === 0 ? 0 : 1);
