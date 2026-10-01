// Dépôt de pièces : certificat médical accepte PDF + photos (JPEG/PNG/WebP/HEIC),
// validation par MAGIC BYTES (jamais l'extension/le type déclaré). Exécuter :
// npx tsx scripts/test-upload-piece.mts
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { validerPiece, sniffType } from "../lib/upload-piece";

let ok = 0, ko = 0;
const check = (l: string, c: boolean, g?: unknown) => {
  if (c) { ok++; console.log(`  ✓ ${l}`); }
  else { ko++; console.log(`  ✗ ${l}` + (g !== undefined ? `  → ${JSON.stringify(g)}` : "")); }
};

// Buffers « magic bytes » minimalistes (+ un peu de corps).
const corps = (head: number[], len = 64) => { const b = Buffer.alloc(len); for (let i = 0; i < head.length; i++) b[i] = head[i]; return b; };
const PDF = corps([0x25, 0x50, 0x44, 0x46, 0x2d, 0x31, 0x2e, 0x34]); // %PDF-1.4
const JPG = corps([0xff, 0xd8, 0xff, 0xe0]);
const PNG = corps([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const WEBP = corps([0x52, 0x49, 0x46, 0x46, 0x10, 0x00, 0x00, 0x00, 0x57, 0x45, 0x42, 0x50]); // RIFF….WEBP
const HEIC = corps([0x00, 0x00, 0x00, 0x18, 0x66, 0x74, 0x79, 0x70, 0x68, 0x65, 0x69, 0x63]); // ftyp heic
const EXE = corps([0x4d, 0x5a, 0x90, 0x00]); // "MZ" (exécutable Windows)

console.log("\n== sniffType (contenu réel) ==");
check("PDF reconnu", sniffType(PDF) === "pdf");
check("JPEG reconnu", sniffType(JPG) === "jpg");
check("PNG reconnu", sniffType(PNG) === "png");
check("WebP reconnu", sniffType(WEBP) === "webp");
check("HEIC reconnu", sniffType(HEIC) === "heic");
check("exécutable (MZ) non reconnu", sniffType(EXE) === null);

console.log("\n== Certificat médical : PDF + photos acceptés ==");
for (const [n, b, t] of [["PDF", PDF, "pdf"], ["JPEG", JPG, "jpg"], ["PNG", PNG, "png"], ["WebP", WEBP, "webp"], ["HEIC", HEIC, "heic"]] as const) {
  const r = validerPiece("certificat_medical", b);
  check(`${n} accepté (type=${t})`, r.ok && r.type === t, r);
}

console.log("\n== Fiche & règlement restent PDF uniquement (générés) ==");
check("fiche : PDF accepté", validerPiece("fiche_inscription", PDF).ok);
check("fiche : image refusée (415)", (() => { const r = validerPiece("fiche_inscription", JPG); return !r.ok && r.status === 415; })());
check("règlement : image refusée (415)", (() => { const r = validerPiece("reglement", PNG); return !r.ok && r.status === 415; })());

console.log("\n== Photo d'identité : JPG/PNG, pas de PDF ==");
check("photo : JPEG accepté", validerPiece("photo", JPG).ok);
check("photo : PDF refusé", !validerPiece("photo", PDF).ok);

console.log("\n== Jugé sur le CONTENU, pas l'extension/nom ==");
// Un PDF réel sur le champ photo → refusé (contenu décide). Une image sur fiche → refusée.
check("contenu PDF sur champ image → refusé", !validerPiece("photo", PDF).ok);
check("contenu image sur champ PDF → refusé", !validerPiece("fiche_inscription", JPG).ok);
check("exécutable déguisé (.jpg) → refusé (415)", (() => { const r = validerPiece("certificat_medical", EXE); return !r.ok && r.status === 415; })());

console.log("\n== Taille : message humain distinct photo / PDF ==");
const bigJpg = Buffer.concat([JPG, Buffer.alloc(16 * 1024 * 1024)]); // > 15 Mo
const bigPdf = Buffer.concat([PDF, Buffer.alloc(11 * 1024 * 1024)]); // > 10 Mo
const rJ = validerPiece("certificat_medical", bigJpg);
check("photo trop lourde → 413 + message humain", !rJ.ok && rJ.status === 413 && /trop lourde|plus près/.test(rJ.error), rJ);
const rP = validerPiece("certificat_medical", bigPdf);
check("PDF trop lourd → 413 + max Mo", !rP.ok && rP.status === 413 && /Mo/.test(rP.error), rP);
check("fichier vide → 400", (() => { const r = validerPiece("certificat_medical", Buffer.alloc(0)); return !r.ok && r.status === 400; })());

console.log("\n== Garde-fous statiques (clients + admin + non-bloquant) ==");
const here = dirname(fileURLToPath(import.meta.url));
const read = (p: string) => readFileSync(join(here, "..", p), "utf8");

const insc = read("components/inscription/InscriptionForm.tsx");
check("inscription : certificat accepte application/pdf + image/*", /field="certificat_medical"[\s\S]*"image\/\*"/.test(insc));
check("inscription : texte d'aide « à plat, bien éclairé, en entier »", insc.includes("Prenez-le à plat, bien éclairé, en entier"));
check("inscription : certificat reste NON bloquant (optional)", /field="certificat_medical"[\s\S]*optional/.test(insc));

const fileDrop = read("components/inscription/FileDrop.tsx");
check("FileDrop : compression client des images (hors photo d'identité)", fileDrop.includes("preparerPiece") && fileDrop.includes('field !== "photo"'));

const espace = read("components/espace/MonEspace.tsx");
check("espace : certificat accepte image/*", espace.includes('accept: "application/pdf,image/*"'));
check("espace : compression client avant envoi", espace.includes("preparerPiece"));

const monEspaceRoute = read("app/api/mon-espace/route.ts");
check("route espace : validation par magic bytes (validerPiece), plus par file.type", monEspaceRoute.includes("validerPiece(field, buffer)") && !/file\.type === "application\/pdf"/.test(monEspaceRoute));

const fiche = read("components/admin/FicheAdherent.tsx");
check("admin : aperçu image inline cliquable", fiche.includes("estApercuImage") && /<img\s/.test(fiche));

console.log(`\nRésultat : ${ok} OK / ${ko} KO`);
process.exit(ko === 0 ? 0 : 1);
