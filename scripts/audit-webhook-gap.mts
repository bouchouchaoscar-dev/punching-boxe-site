/**
 * Audit READ-ONLY : réconciliation DB (Supabase) <-> Stripe pour la fenêtre
 * où le webhook Stripe était KO (apex sans www -> 308 non suivi).
 * Ne modifie RIEN. Aucune écriture en base.
 *
 * Usage : npx tsx scripts/audit-webhook-gap.mts
 * Sortie : fichier texte dans le dossier temp de l'OS (chemin affiché en fin
 *          d'exécution), ou chemin imposé via la variable d'env AUDIT_OUT.
 */
import { readFileSync, writeFileSync, appendFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createClient } from "@supabase/supabase-js";
import Stripe from "stripe";

// Charge .env.local manuellement (pas de dotenv installé).
for (const line of readFileSync(new URL("../.env.local", import.meta.url), "utf8").split("\n")) {
  const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2].trim().replace(/^["']|["']$/g, "");
}

const OUT = process.env.AUDIT_OUT || join(tmpdir(), "audit-webhook-gap-report.txt");
writeFileSync(OUT, "");
const log = (s = "") => { appendFileSync(OUT, s + "\n"); };

const CUTOFF_ISO = "2026-06-17T15:21:00Z";
const CUTOFF = Math.floor(new Date(CUTOFF_ISO).getTime() / 1000);

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
  timeout: 12000,
  maxNetworkRetries: 1,
});

const E = (n: number | null | undefined) =>
  n == null ? "—" : `${Number(n).toFixed(2)}€`;
const D = (s: string | null | undefined) =>
  s ? new Date(s).toISOString().replace("T", " ").slice(0, 16) : "—";

type Flag = { sev: "🔴" | "🟠" | "🟢"; who: string; msg: string };
const flags: Flag[] = [];

async function piStatus(id: string | null | undefined) {
  if (!id) return null;
  try { return (await stripe.paymentIntents.retrieve(id)).status; }
  catch { return "introuvable"; }
}
async function siStatus(id: string | null | undefined) {
  if (!id) return null;
  try { return (await stripe.setupIntents.retrieve(id)).status; }
  catch { return "introuvable"; }
}

async function main() {
  log("==================================================================");
  log(" AUDIT WEBHOOK GAP — DB vs STRIPE");
  log(` Fenêtre : adhérents créés depuis ${CUTOFF_ISO}`);
  log("==================================================================\n");

  const { data: adherents, error } = await supabase
    .from("adherents")
    .select("*")
    .gte("created_at", CUTOFF_ISO)
    .order("created_at", { ascending: true });
  if (error) throw error;

  log(`Adhérents créés depuis le 17/06 15:21 UTC : ${adherents?.length ?? 0}\n`);

  for (const a of adherents ?? []) {
    const who = `${a.prenom} ${a.nom}`.trim();
    log("------------------------------------------------------------------");
    log(`• ${who} | ${a.email} | créé ${D(a.created_at)} | ${a.saison}`);
    log(
      `  mode=${a.mode_paiement} statut=${a.statut_paiement} ` +
        `nb_ech=${a.nb_echeances} payées=${a.echeances_payees} ` +
        `total=${E(a.montant_total)} engage_at=${D(a.engage_at)} ` +
        `annule_at=${D(a.annule_at)}`,
    );
    if (a.derniere_erreur_stripe)
      log(`  ⚠ dernière erreur stripe: ${a.derniere_erreur_stripe} (${a.derniere_erreur_code ?? "—"})`);
    if (a.montant_rembourse) log(`  ↩ remboursé: ${E(a.montant_rembourse)} @ ${D(a.rembourse_at)}`);
    if (a.litige) log(`  ⚖ litige: ${a.litige_statut}`);

    const { data: paiements } = await supabase
      .from("paiements")
      .select("*")
      .eq("adherent_id", a.id)
      .order("numero_echeance", { ascending: true });
    if (paiements?.length) {
      for (const p of paiements) {
        const real = await piStatus(p.stripe_payment_intent_id);
        const flagMismatch =
          (p.statut === "paye" && real && real !== "succeeded") ||
          (p.statut !== "paye" && real === "succeeded");
        log(
          `   éch#${p.numero_echeance ?? "?"} ${E(p.montant)} db=${p.statut}` +
            ` prévu=${D(p.date_prevue)} payé=${D(p.date_paiement)}` +
            (p.stripe_payment_intent_id ? ` stripe=${real}` : ` (pas de PI)`) +
            (flagMismatch ? "  <<< MISMATCH" : ""),
        );
        if (p.statut !== "paye" && real === "succeeded")
          flags.push({ sev: "🔴", who, msg: `éch#${p.numero_echeance} encaissée chez Stripe mais db='${p.statut}'` });
        if (p.statut === "paye" && real && real !== "succeeded" && real !== "introuvable")
          flags.push({ sev: "🟠", who, msg: `éch#${p.numero_echeance} db='paye' mais Stripe='${real}'` });
      }
    } else {
      log("   (aucune ligne paiements)");
    }

    const isStripe = String(a.mode_paiement).startsWith("stripe");
    if (isStripe) {
      const comptant = (a.nb_echeances || 1) <= 1;
      if (comptant) {
        const real = await piStatus(a.stripe_payment_intent_id);
        log(`   [comptant] PI=${a.stripe_payment_intent_id ?? "—"} -> stripe=${real ?? "—"}`);
        if (real === "succeeded" && a.statut_paiement !== "paye" && !a.annule_at)
          flags.push({ sev: "🔴", who, msg: `comptant PAYÉ chez Stripe mais statut db='${a.statut_paiement}' (webhook perdu)` });
        if (real && real !== "succeeded" && real !== "introuvable" && a.statut_paiement === "paye")
          flags.push({ sev: "🟠", who, msg: `comptant statut db='paye' mais Stripe='${real}'` });
        if (real === "requires_payment_method" && a.statut_paiement === "en_attente")
          flags.push({ sev: "🟢", who, msg: `comptant jamais payé (panier abandonné), cohérent` });
      } else {
        const real = await siStatus(a.stripe_setup_intent_id);
        log(`   [fractionné] SetupIntent=${a.stripe_setup_intent_id ?? "—"} -> stripe=${real ?? "—"}`);
        if (real === "succeeded" && (!paiements || paiements.length === 0))
          flags.push({ sev: "🔴", who, msg: `carte enregistrée (SetupIntent ok) mais AUCUNE échéance créée (confirm-payment jamais exécuté)` });
      }
    }
  }

  log("\n==================================================================");
  log(" SCAN DIRECT STRIPE — charges depuis le 17/06 15:21 UTC");
  log("==================================================================");
  let totalCharges = 0, totalEncaisse = 0, totalRefunded = 0, disputed = 0;
  const charges = await stripe.charges.list({ created: { gte: CUTOFF }, limit: 100 });
  for (const c of charges.data) {
    totalCharges++;
    if (c.paid && c.status === "succeeded") totalEncaisse += c.amount / 100;
    if (c.amount_refunded) totalRefunded += c.amount_refunded / 100;
    if (c.disputed) disputed++;
    const refundTag = c.amount_refunded ? ` ↩refund=${E(c.amount_refunded / 100)}` : "";
    const dispTag = c.disputed ? " ⚖DISPUTE" : "";
    log(
      `  ${D(new Date(c.created * 1000).toISOString())} ${E(c.amount / 100)} ${c.status}` +
        ` ${c.billing_details?.email ?? c.receipt_email ?? "?"}` +
        ` pi=${typeof c.payment_intent === "string" ? c.payment_intent : "?"}` +
        refundTag + dispTag,
    );
  }
  log(
    `\n  Total charges Stripe (fenêtre): ${totalCharges} | encaissé≈${E(totalEncaisse)}` +
      ` | remboursé≈${E(totalRefunded)} | litiges=${disputed}`,
  );
  if (charges.has_more) log("  ⚠ has_more=true (>100 charges, pagination à étendre)");

  log("\n==================================================================");
  log(" SYNTHÈSE DES INCOHÉRENCES");
  log("==================================================================");
  if (flags.length === 0) {
    log(" ✅ Aucune incohérence DB<->Stripe détectée sur la fenêtre.");
  } else {
    for (const f of flags) log(` ${f.sev} ${f.who} — ${f.msg}`);
    log(`\n 🔴 critiques=${flags.filter((f) => f.sev === "🔴").length} | 🟠 à vérifier=${flags.filter((f) => f.sev === "🟠").length} | 🟢 info=${flags.filter((f) => f.sev === "🟢").length}`);
  }
  log("\n[FIN]");
  console.log("Audit terminé. Rapport écrit dans : " + OUT);
}

main().catch((e) => { log("ERREUR: " + (e?.message || e)); console.error("ERREUR: " + (e?.message || e)); process.exit(1); });
