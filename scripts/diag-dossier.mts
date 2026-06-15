import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";
for (const line of readFileSync(".env.local", "utf8").split("\n")) {
  const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
}
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

// Dossiers créés récemment (derniers ~12h), tous emails.
const since = new Date(Date.now() - 12 * 3600 * 1000).toISOString();
const { data: adhs } = await supabase
  .from("adherents")
  .select(
    "id, prenom, nom, email, mode_paiement, nb_echeances, echeances_payees, montant_total, statut_paiement, derniere_erreur_code, derniere_erreur_stripe, stripe_customer_id, created_at",
  )
  .gte("created_at", since)
  .order("created_at", { ascending: false });

for (const a of adhs ?? []) {
  console.log("\n========================================");
  console.log(`${a.prenom} ${a.nom}  <${a.email}>`);
  console.log(`id=${a.id}`);
  console.log(`mode=${a.mode_paiement}  nb_echeances=${a.nb_echeances}  payees=${a.echeances_payees}`);
  console.log(`montant_total=${a.montant_total}  statut=${a.statut_paiement}`);
  console.log(`erreur_code=${a.derniere_erreur_code}  erreur_msg=${a.derniere_erreur_stripe}`);
  console.log(`customer=${a.stripe_customer_id}  créé=${a.created_at}`);

  const { data: ps } = await supabase
    .from("paiements")
    .select("numero_echeance, montant, statut, stripe_payment_intent_id, date_prevue, date_paiement, created_at")
    .eq("adherent_id", a.id)
    .order("created_at", { ascending: true });
  console.log(`  --- ${ps?.length ?? 0} ligne(s) paiements ---`);
  for (const p of ps ?? []) {
    console.log(
      `  n°${p.numero_echeance ?? "—"} | ${p.montant}€ | ${p.statut} | PI=${p.stripe_payment_intent_id ?? "null"} | prévu=${p.date_prevue} | payé=${p.date_paiement ?? "—"} | créé=${p.created_at}`,
    );
  }
}
