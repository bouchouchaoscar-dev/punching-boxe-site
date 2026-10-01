// Photo du visage : rappel de cadrage, consignes, motifs admin, libellés.
// Exécuter : npx tsx scripts/test-photo-visage.mts
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { cadrageModifie } from "../lib/crop-image";

let ok = 0, ko = 0;
const check = (l: string, c: boolean, g?: unknown) => {
  if (c) { ok++; console.log(`  ✓ ${l}`); }
  else { ko++; console.log(`  ✗ ${l}` + (g !== undefined ? `  → ${JSON.stringify(g)}` : "")); }
};
const here = dirname(fileURLToPath(import.meta.url));
const read = (p: string) => readFileSync(join(here, "..", p), "utf8");

console.log("\n== Rappel affiché seulement si cadrage inchangé (cadrageModifie) ==");
check("état initial (zoom 1, centré) → NON modifié → rappel", cadrageModifie(1, { x: 0, y: 0 }) === false);
check("zoom modifié → modifié → pas de rappel", cadrageModifie(1.5, { x: 0, y: 0 }) === true);
check("déplacement horizontal → modifié", cadrageModifie(1, { x: 12, y: 0 }) === true);
check("déplacement vertical → modifié", cadrageModifie(1, { x: 0, y: -8 }) === true);

console.log("\n== Outil de recadrage (consigne + loupe + rappel) ==");
const modal = read("components/inscription/PhotoCropModal.tsx");
check("consigne : « visage remplisse le cercle »", modal.includes("que le visage remplisse le cercle"));
check("loupe + curseur zoom", modal.includes('aria-label="Zoom de la photo"') && /<svg[\s\S]*circle[\s\S]*Zoom de la photo/.test(modal));
check("validation différée si non ajusté (valider(force))", modal.includes("function valider(force = false)") && modal.includes("if (!force && !ajuste)"));
check("question « Le visage remplit-il bien le cercle ? »", modal.includes("Le visage remplit-il bien le cercle ?"));
check("bouton « Ajuster » (revient au recadrage)", modal.includes(">\n                Ajuster") || modal.includes(">Ajuster<") || modal.includes("Ajuster\n"));
check("bouton « Oui, c'est bon » (valide)", modal.includes("Oui, c'est bon") && modal.includes("valider(true)"));
check("ton léger (pas d'alerte rouge : classes neutres)", modal.includes("bg-paper-2") && !/Le visage remplit[\s\S]{0,200}bg-red/.test(modal));

console.log("\n== Libellés & aide (inscription, mineur adapté) ==");
const insc = read("components/inscription/InscriptionForm.tsx");
check("inscription : libellé « Photo du visage »", insc.includes('label="Photo du visage"'));
check("inscription : aide majeur « de votre visage … un selfie suffit »", insc.includes("Une photo récente de votre visage, de face et bien éclairée : un selfie suffit."));
check("inscription : aide mineur « de son visage »", insc.includes("Une photo récente de son visage, de face et bien éclairée : un selfie suffit."));
check("inscription : repli pièce d'identité en zoomant", insc.includes("votre pièce d'identité, en zoomant sur le visage"));

console.log("\n== Libellés & aide (espace adhérent) ==");
const espace = read("components/espace/MonEspace.tsx");
check("espace : libellé « Photo du visage »", espace.includes('label: "Photo du visage"'));
check("espace : aide mineur/majeur (selfie + pièce d'identité en zoomant)", espace.includes("un selfie suffit") && espace.includes("en zoomant sur le visage"));

console.log("\n== Admin : motifs de refus rapides (photo) ==");
const fiche = read("components/admin/FicheAdherent.tsx");
check("motif 1 : centrer sur le visage + zoom", fiche.includes("La photo doit être centrée sur votre visage. Utilisez le zoom de l'outil pour bien cadrer."));
check("motif 2 : selfie plutôt que pièce d'identité entière", fiche.includes("Merci de fournir une photo récente de votre visage (un selfie convient), plutôt que votre pièce d'identité entière."));
check("motif 3 : floue/sombre", fiche.includes("Photo floue ou trop sombre. Merci d'en prendre une nouvelle, bien éclairée."));
check("motifs réservés à la photo (d.base === 'photo')", /d\.base === "photo"[\s\S]{0,200}MOTIFS_PHOTO/.test(fiche));
check("clic → pré-remplit le champ (modifiable)", fiche.includes("onClick={() => setRefuseMotif(m)}") && fiche.includes("value={refuseMotif}"));

console.log(`\nRésultat : ${ok} OK / ${ko} KO`);
process.exit(ko === 0 ? 0 : 1);
