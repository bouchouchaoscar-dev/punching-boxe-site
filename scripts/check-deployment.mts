// ============================================================================
// CHECK DEPLOYMENT — vérifie qu'un déploiement est prêt avant le GO.
//   npx tsx scripts/check-deployment.mts
// Lit .env.local (ou l'environnement). Affiche ✅ / ❌ + action corrective.
// 100% lecture seule (n'envoie aucun mail, ne déclenche aucun prélèvement).
// ============================================================================
import { readFileSync, existsSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";

if (existsSync(".env.local")) {
  for (const line of readFileSync(".env.local", "utf8").split("\n")) {
    const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
  }
}
let ko = 0;
const ok = (m: string) => console.log("  ✅ " + m);
const bad = (m: string, fix: string) => { ko++; console.log("  ❌ " + m + "\n       → " + fix); };
const env = (k: string) => (process.env[k] ?? "").trim();

console.log("\n── 1) Variables d'environnement ──");
const REQUIRED = [
  "NEXT_PUBLIC_SITE_URL", "NEXT_PUBLIC_SUPABASE_URL", "NEXT_PUBLIC_SUPABASE_ANON_KEY",
  "SUPABASE_SERVICE_ROLE_KEY", "STRIPE_SECRET_KEY", "NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY",
  "STRIPE_WEBHOOK_SECRET", "RESEND_API_KEY", "RESEND_FROM", "ADMIN_NOTIFY_EMAIL",
  "NEXT_PUBLIC_ADMIN_USERNAME", "ADMIN_PASSWORD", "CRON_SECRET",
];
for (const k of REQUIRED) env(k) ? ok(`${k} présent`) : bad(`${k} manquant/vide`, `Renseigner ${k} (.env.local + Vercel).`);

const SITE = env("NEXT_PUBLIC_SITE_URL");
console.log("\n── 2) Domaine / URL canonique ──");
if (!SITE.startsWith("https://")) bad("SITE_URL non https", "Mettre https://...");
else if (!SITE.includes("www.")) bad(`SITE_URL = ${SITE} (apex)`, "L'apex redirige (308) vers www → utiliser https://www.<domaine> partout (GitHub secret inclus).");
else ok(`SITE_URL = ${SITE}`);

console.log("\n── 3) Supabase ──");
try {
  const sb = createClient(env("NEXT_PUBLIC_SUPABASE_URL"), env("SUPABASE_SERVICE_ROLE_KEY"));
  const { error } = await sb.from("adherents").select("id", { count: "exact", head: true });
  error ? bad("Requête Supabase échouée: " + error.message, "Vérifier l'URL/clé + schéma appliqué (001_schema_complet.sql).") : ok("Connexion Supabase + table adherents OK");
} catch (e) { bad("Supabase injoignable: " + (e as Error).message, "Vérifier NEXT_PUBLIC_SUPABASE_URL / SERVICE_ROLE_KEY."); }

console.log("\n── 4) Stripe (mode live) ──");
const sk = env("STRIPE_SECRET_KEY");
if (!sk) bad("STRIPE_SECRET_KEY manquant", "Renseigner la clé.");
else {
  sk.startsWith("sk_live_") ? ok("Clé Stripe LIVE détectée") : bad(`Clé Stripe = ${sk.slice(0, 8)}… (TEST)`, "Passer en sk_live_ pour la production.");
  try {
    const { default: Stripe } = await import("stripe");
    const stripe = new Stripe(sk);
    await stripe.balance.retrieve();
    ok("Compte Stripe joignable");
    console.log("\n── 5) Webhook Stripe ──");
    const hooks = await stripe.webhookEndpoints.list({ limit: 100 });
    const want = ["payment_intent.succeeded", "payment_intent.payment_failed", "setup_intent.succeeded", "charge.refunded", "charge.dispute.created", "charge.dispute.closed"];
    const target = `${SITE}/api/stripe-webhook`;
    const hook = hooks.data.find((h) => h.url === target);
    if (!hook) bad(`Aucun webhook vers ${target}`, `Créer le webhook live → ${target} avec les 6 events.`);
    else {
      const missing = want.filter((e) => !(hook.enabled_events as string[]).includes(e) && !(hook.enabled_events as string[]).includes("*"));
      missing.length ? bad("Webhook events manquants: " + missing.join(", "), "Ajouter ces events au endpoint.") : ok("Webhook live + 6 events OK");
    }
  } catch (e) { bad("Stripe API erreur: " + (e as Error).message, "Vérifier la clé secrète."); }
}

console.log("\n── 6) Resend ──");
const rk = env("RESEND_API_KEY");
if (!rk.startsWith("re_")) bad("RESEND_API_KEY invalide", "Clé Resend re_...");
else {
  try {
    const r = await fetch("https://api.resend.com/domains", { headers: { Authorization: `Bearer ${rk}` } });
    if (!r.ok) bad("Resend API " + r.status, "Vérifier la clé.");
    else {
      const d = await r.json();
      const fromDom = (env("RESEND_FROM").match(/@([^>\s]+)/) ?? [])[1];
      const verified = (d.data ?? []).find((x: any) => x.name === fromDom && x.status === "verified");
      verified ? ok(`Domaine Resend vérifié (${fromDom})`) : bad(`Domaine ${fromDom} non vérifié`, "Vérifier le domaine dans Resend (SPF/DKIM dans OVH).");
    }
  } catch (e) { bad("Resend injoignable: " + (e as Error).message, "Vérifier la connectivité."); }
}

console.log("\n── 7) Site en ligne (/api/health) ──");
try {
  const r = await fetch(`${SITE}/api/health`, { redirect: "manual" });
  if (r.status >= 300 && r.status < 400) bad(`/api/health → ${r.status} (redirection)`, "L'URL redirige → cibler le host canonique (www).");
  else r.ok ? ok("/api/health → 200") : bad(`/api/health → ${r.status}`, "Vérifier le déploiement Vercel + DNS.");
} catch (e) { bad("Site injoignable: " + (e as Error).message, "Vérifier DNS (OVH) + déploiement Vercel."); }

console.log("\n── 8) Cron endpoint (protégé) ──");
try {
  const r = await fetch(`${SITE}/api/cron/charge-echeances`, { redirect: "manual" });
  if (r.status === 401) ok("Cron joignable et protégé (401 sans secret)");
  else if (r.status >= 300 && r.status < 400) bad(`Cron → ${r.status} (redirection)`, "Cibler le host canonique (www) dans cron-job.org / GitHub.");
  else bad(`Cron → ${r.status} (attendu 401)`, "Vérifier la route + CRON_SECRET.");
} catch (e) { bad("Cron injoignable: " + (e as Error).message, "Vérifier le déploiement."); }
console.log("       (rappel : configurer cron-job.org → GET " + SITE + "/api/cron/charge-echeances, header Authorization: Bearer <CRON_SECRET>)");

console.log(ko === 0 ? "\n✅ TOUT EST PRÊT — GO 🚀" : `\n❌ ${ko} point(s) à corriger avant le GO.`);
process.exit(ko === 0 ? 0 : 1);
