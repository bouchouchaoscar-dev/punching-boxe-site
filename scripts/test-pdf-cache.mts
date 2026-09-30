// Sécurité des en-têtes de cache des PDF/documents personnels.
// Un document personnel ne doit jamais être public ni mis en cache partagé.
// Exécuter : npx tsx scripts/test-pdf-cache.mts
import { readFileSync } from "node:fs";
import { pdfHeaders, pdfHeadersPublic } from "../lib/pdf/headers";

let ok = 0;
let ko = 0;
const check = (l: string, c: boolean, g?: unknown) => {
  if (c) { ok++; console.log(`  ✓ ${l}`); }
  else { ko++; console.log(`  ✗ ${l}` + (g !== undefined ? `  → ${JSON.stringify(g)}` : "")); }
};
const read = (p: string) => readFileSync(p, "utf8");
const cc = (h: HeadersInit) => (h as Record<string, string>)["Cache-Control"] ?? "";

console.log("[pdfHeaders — sûr par défaut]");
{
  const def = cc(pdfHeaders("x.pdf"));
  check("pdfHeaders : private", /private/.test(def), def);
  check("pdfHeaders : no-store", /no-store/.test(def), def);
  check("pdfHeaders : jamais public", !/public/.test(def), def);
  const pub = cc(pdfHeadersPublic("x.pdf"));
  check("pdfHeadersPublic : public + max-age", /public/.test(pub) && /max-age=\d+/.test(pub), pub);
}

// Documents PERSONNELS : private + no-store, jamais public.
console.log("[documents personnels — private + no-store]");
{
  const perso = [
    "app/api/mon-espace/facture/route.tsx",
    "app/api/admin/adherents/[id]/facture/route.tsx",
    "app/api/admin/trombinoscope/route.tsx",
    "app/api/documents/previsualiser/route.ts",
  ];
  for (const p of perso) {
    const src = read(p);
    const m = src.match(/"Cache-Control":\s*"([^"]+)"/);
    const val = m?.[1] ?? "";
    const nom = p.split("/").slice(-2).join("/");
    check(`${nom} : private`, /private/.test(val), val);
    check(`${nom} : no-store`, /no-store/.test(val), val);
    check(`${nom} : jamais public`, !/public/.test(val), val);
    // Aucun de ces fichiers ne doit utiliser le helper public.
    check(`${nom} : n'utilise pas pdfHeadersPublic`, !/pdfHeadersPublic/.test(src));
  }
}

// Documents PUBLICS génériques (modèles vierges + aperçu sample) : cache OK.
console.log("[documents génériques — pdfHeadersPublic]");
{
  const publics = [
    "app/api/documents/fiche-inscription/route.ts",
    "app/api/documents/reglement-interieur/route.ts",
    "app/api/documents/certificat-medical/route.ts",
    "app/api/documents/apercu/route.ts",
  ];
  for (const p of publics) {
    const src = read(p);
    const nom = p.split("/").slice(-2).join("/");
    check(`${nom} : utilise pdfHeadersPublic`, /pdfHeadersPublic\(/.test(src));
    check(`${nom} : n'utilise plus pdfHeaders() par défaut`, !/[^c]\bpdfHeaders\(/.test(src));
  }
}

console.log(`\nRésultat : ${ok} OK / ${ko} KO`);
process.exit(ko === 0 ? 0 : 1);
