// Garde anti-« erreur Supabase avalée » (exigerData) + non-régression des cas A
// (argent) et B (mails/relances) corrigés : une erreur DOIT remonter, jamais être
// comptée comme zéro. Exécuter : npx tsx scripts/test-supabase-guard.mts
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { exigerData } from "../lib/supabase";

let ok = 0, ko = 0;
const check = (l: string, c: boolean, g?: unknown) => {
  if (c) { ok++; console.log(`  ✓ ${l}`); }
  else { ko++; console.log(`  ✗ ${l}` + (g !== undefined ? `  → ${JSON.stringify(g)}` : "")); }
};
const throws = (fn: () => unknown): string | null => {
  try { fn(); return null; } catch (e) { return e instanceof Error ? e.message : String(e); }
};

console.log("\n== exigerData (unité) ==");
// Requête OK : renvoie data tel quel (liste).
check("succès → renvoie la liste", JSON.stringify(exigerData({ data: [1, 2], error: null }, "ctx")) === "[1,2]");
// maybeSingle « introuvable » légitime : data null, pas d'erreur → renvoie null.
check("succès + data null → renvoie null (introuvable légitime)", exigerData({ data: null, error: null }, "ctx") === null);
// Requête EN ÉCHEC : lève, avec le contexte dans le message.
const msg = throws(() => exigerData({ data: null, error: { message: "colonne absente" } }, "relance dossiers"));
check("erreur → lève (ne renvoie pas null/[])", msg !== null);
check("message inclut le contexte", !!msg && msg.includes("relance dossiers"), msg);
check("message inclut la cause Supabase", !!msg && msg.includes("colonne absente"), msg);

console.log("\n== Contraste : l'ancien motif avalait, exigerData surface ==");
// Simule une requête EN ÉCHEC (comme PostgREST : data=null, error renseigné).
const resEchec = { data: null as number[] | null, error: { message: "boom réseau" } };
const ancien = resEchec.data ?? []; // ❌ ancien motif : une erreur devient []
check("ancien motif `data ?? []` → [] (0, faux !)", ancien.length === 0);
check("exigerData sur la MÊME réponse → lève", throws(() => exigerData(resEchec, "select")) !== null);

console.log("\n== Cas A (argent) corrigés : exigerData en place ==");
const here = dirname(fileURLToPath(import.meta.url));
const read = (p: string) => readFileSync(join(here, "..", p), "utf8");
const pay = read("lib/payments.ts");
const slice = (s: string, from: string, to: string) => {
  const i = s.indexOf(from); const j = to ? s.indexOf(to, i) : s.length;
  return i < 0 ? "" : s.slice(i, j < 0 ? s.length : j);
};
const recalc = slice(pay, "export async function recalculerEtatPaiement", "export async function marquerEcheancePayee");
check("recalculerEtatPaiement: lecture échéances via exigerData (pas `paiements ?? []` cru)", recalc.includes("exigerData("));
check("recalculerEtatPaiement: erreur adhérent remontée (throw)", recalc.includes("throw new Error"));
const remb = slice(pay, "export async function appliquerRemboursement", "export async function appliquerLitige");
check("appliquerRemboursement: cumul via exigerData", (remb.match(/exigerData\(/g) ?? []).length >= 2);
const charger = slice(pay, "export async function chargerEcheance", "");
check("chargerEcheance: lectures échéance/adhérent via exigerData", (charger.match(/exigerData\(/g) ?? []).length >= 2);

console.log("\n== Cas B (mails/relances) corrigés : exigerData en place ==");
const camp = read("lib/envoi-campagne.ts");
check("campagne: porte RGPD désinscriptions via exigerData", camp.includes('"campagne: select désinscriptions (RGPD)"'));
check("campagne: porte bounces via exigerData", camp.includes('"campagne: select emails bouncés"'));
check("campagne: exclusion anciens migrés via exigerData", camp.includes("anciens migrés (exclusion)"));
const cron = read("app/api/cron/charge-echeances/route.ts");
const fnDossier = slice(cron, "async function relancerDossiersSansPaiement", "async function relancerPaniersAbandonnes");
check("relance dossiers: select via exigerData (cause du faux 0 d'origine)", fnDossier.includes("exigerData("));
check("cron: erreurs de passe remontées dans la réponse (champ `erreurs`)", cron.includes("erreurs: Object.keys(erreurs).length ? erreurs : undefined"));
const presence = read("app/api/cron/presence/route.ts");
check("cron présence: select essais via exigerData", presence.includes("exigerData("));

console.log("\n== Cas D liés à l'argent : interruption propre sur erreur ==");
// Faux client Supabase : toute requête (quel que soit le chaînage) se résout sur
// le `result` fourni. Permet de simuler une requête EN ÉCHEC (error renseigné).
function fakeClient(result: { data: unknown; error: { message: string } | null }) {
  const q: Record<string, unknown> = {};
  const methods = ["from", "select", "eq", "in", "or", "is", "not", "order", "limit", "gte", "lte", "like", "maybeSingle", "single"];
  for (const m of methods) q[m] = () => q;
  (q as { then: unknown }).then = (resolve: (v: unknown) => unknown) => Promise.resolve(result).then(resolve);
  return { from: () => q } as unknown as import("@supabase/supabase-js").SupabaseClient;
}
const echecRes = { data: null, error: { message: "réseau coupé" } };
const okVide = { data: [], error: null };

const { evaluerAnciennete } = await import("../lib/anciennete");
const { trouverDossierDoublon } = await import("../lib/inscription");

// anciennete : une lecture en échec ne doit JAMAIS renvoyer « nouveau » (= adhésion
// facturée). Elle doit LEVER pour interrompre l'inscription.
let ancThrow = false;
try {
  await evaluerAnciennete(fakeClient(echecRes), { nom: "Doe", prenom: "Jane", date_naissance: "2000-01-01" }, "2026-2027");
} catch { ancThrow = true; }
check("evaluerAnciennete : erreur → lève (ne facture pas l'adhésion à tort)", ancThrow);
// Sanité : sans erreur, elle renvoie normalement (pas de throw parasite).
let ancOk = false;
try {
  const r = await evaluerAnciennete(fakeClient(okVide), { nom: "Doe", prenom: "Jane", date_naissance: "2000-01-01" }, "2026-2027");
  ancOk = typeof r.paieAdhesion === "boolean";
} catch { ancOk = false; }
check("evaluerAnciennete : sans erreur → renvoie normalement", ancOk);

// inscription : une lecture en échec ne doit JAMAIS renvoyer null (= « pas de
// doublon »). Elle doit LEVER.
let dupThrow = false;
try {
  await trouverDossierDoublon(fakeClient(echecRes), {
    titulaire_id: "u1", saison: "2026-2027", match_key: "doe|jane|2000-01-01",
    nom: "Doe", prenom: "Jane", date_naissance: "2000-01-01",
  });
} catch { dupThrow = true; }
check("trouverDossierDoublon : erreur → lève (ne conclut pas « pas de doublon »)", dupThrow);
// Sanité : pas de titulaire → null immédiat (aucune requête, aucun throw).
const dupNull = await trouverDossierDoublon(fakeClient(echecRes), {
  titulaire_id: null, saison: "2026-2027", match_key: null, nom: "", prenom: "", date_naissance: "",
});
check("trouverDossierDoublon : sans titulaire → null (pas de requête)", dupNull === null);

// facture-gen : lecture en échec → erreur LISIBLE (ok:false, 500), jamais un PDF faux.
const facture = read("lib/pdf/facture-gen.tsx");
const cf = slice(facture, "export async function construireFacturePdf", "");
check("facture : lectures adhérent/échéances via exigerData", (cf.match(/exigerData\(/g) ?? []).length >= 2);
check("facture : erreur → renvoie ok:false status 500 (pas de PDF faux)", cf.includes("status: 500") && cf.includes("Merci de réessayer"));

// Les routes d'inscription/tarif interrompent avec un message « réessayer ».
const rAnc = read("app/api/inscription/anciennete/route.ts");
check("route ancienneté : message clair « réessayer » sur erreur", rAnc.includes("réessayer") && rAnc.includes("evaluerAnciennete"));
const rCpi = read("app/api/create-payment-intent/route.ts");
check("create-payment-intent : ancienneté en try/catch → 503 « réessayer »", rCpi.includes("Ancienneté (create-payment-intent)"));

console.log(`\nRésultat : ${ok} OK / ${ko} KO`);
process.exit(ko === 0 ? 0 : 1);
