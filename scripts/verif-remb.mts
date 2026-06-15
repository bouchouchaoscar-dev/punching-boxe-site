import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";
for (const line of readFileSync(".env.local", "utf8").split("\n")) {
  const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
}
const sb = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);
const sid = (id: string) => id.slice(0, 8); // id court, pas de PII

const { data: adh } = await sb
  .from("adherents")
  .select("id, mode_paiement, statut_paiement, montant_total, montant_rembourse, annule_at, rembourse_at, prochaine_echeance, saison")
  .order("created_at", { ascending: true });

const ids = (adh ?? []).map((a) => a.id);
const { data: pay } = await sb
  .from("paiements")
  .select("adherent_id, montant, montant_rembourse, statut, numero_echeance, stripe_payment_intent_id, date_paiement")
  .in("adherent_id", ids.length ? ids : ["00000000-0000-0000-0000-000000000000"]);

const { data: remb } = await sb
  .from("remboursements")
  .select("id, adherent_id, montant_demande, montant_effectif, canal, ferme_inscription, statut, detail, created_at, finished_at")
  .order("created_at", { ascending: true });

const round2 = (n: number) => Math.round(n * 100) / 100;

console.log("══════════ ADHERENTS ══════════");
for (const a of adh ?? []) {
  const rows = (pay ?? []).filter((p) => p.adherent_id === a.id);
  const net = round2(
    rows.filter((p) => p.statut === "paye" || p.statut === "rembourse")
      .reduce((s, p) => s + Number(p.montant || 0) - Number(p.montant_rembourse || 0), 0),
  );
  console.log(
    `\n[${sid(a.id)}] mode=${a.mode_paiement} statut=${a.statut_paiement} total=${a.montant_total}€`,
  );
  console.log(
    `   montant_rembourse=${a.montant_rembourse ?? 0}€ | annule_at=${a.annule_at ? a.annule_at.slice(0,16) : "NULL"} | rembourse_at=${a.rembourse_at ? "set" : "null"} | prochaine_echeance=${a.prochaine_echeance ?? "null"}`,
  );
  console.log(`   ENCAISSÉ NET (calc paiements) = ${net}€`);
  for (const p of rows) {
    console.log(
      `     · ligne statut=${p.statut} num=${p.numero_echeance ?? "—"} montant=${p.montant}€ remb=${p.montant_rembourse ?? 0}€ PI=${p.stripe_payment_intent_id ? p.stripe_payment_intent_id.slice(0,12)+"…" : "NULL(espèces)"} date_paie=${p.date_paiement ? p.date_paiement.slice(0,10) : "—"}`,
    );
  }
}

console.log("\n══════════ REMBOURSEMENTS (table) ══════════");
if (!(remb ?? []).length) console.log("(vide)");
for (const r of remb ?? []) {
  const refunds = (r.detail as any)?.refunds ?? [];
  const refundIds = refunds.map((x: any) => x.refundId).filter(Boolean);
  console.log(
    `[${sid(r.id)}] adh=${sid(r.adherent_id)} statut=${r.statut} canal=${r.canal} ferme=${r.ferme_inscription} demandé=${r.montant_demande ?? "—"}€ effectif=${r.montant_effectif ?? "—"}€`,
  );
  console.log(
    `   echeancesAnnulees=${(r.detail as any)?.echeancesAnnulees ?? "—"} | refunds Stripe=${refundIds.length ? refundIds.join(", ") : "(aucun)"} | créé=${r.created_at?.slice(0,16)} fini=${r.finished_at ? r.finished_at.slice(0,16) : "—"}`,
  );
}
