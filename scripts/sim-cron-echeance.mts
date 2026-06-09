// Outil de TEST du cron de prélèvement des échéances (fractionné).
// Ne touche JAMAIS aux montants : il ne fait que (a) afficher l'état d'un dossier
// et de ses échéances, (b) forcer la prochaine échéance non payée à « due
// aujourd'hui » pour que le cron la prélève lors du test réel.
//
// Usage :
//   npx tsx scripts/sim-cron-echeance.mts show <adherentId>
//   npx tsx scripts/sim-cron-echeance.mts due  <adherentId>
//
// Nécessite NEXT_PUBLIC_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY dans .env.local.

import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";

// Charge .env.local sans dépendance.
for (const line of readFileSync(".env.local", "utf8").split("\n")) {
  const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
}

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) {
  console.error(
    "❌ NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY absents de .env.local.",
  );
  process.exit(1);
}
const supabase = createClient(url, key);

const action = process.argv[2] ?? "show";
const id = process.argv[3];
if (!id) {
  console.error("Usage : npx tsx scripts/sim-cron-echeance.mts <show|due> <adherentId>");
  process.exit(1);
}

const today = new Date().toISOString().slice(0, 10);

async function etat(label: string) {
  const { data: a } = await supabase
    .from("adherents")
    .select(
      "prenom, nom, mode_paiement, nb_echeances, echeances_payees, statut_paiement, prochaine_echeance",
    )
    .eq("id", id)
    .maybeSingle();
  const { data: p } = await supabase
    .from("paiements")
    .select(
      "numero_echeance, montant, statut, date_prevue, date_paiement, stripe_payment_intent_id",
    )
    .eq("adherent_id", id)
    .order("numero_echeance", { ascending: true, nullsFirst: true });

  console.log(`\n===== ${label} =====`);
  if (!a) {
    console.log("Dossier introuvable.");
    return;
  }
  console.log(
    `${a.prenom} ${a.nom} · ${a.mode_paiement} · statut=${a.statut_paiement} · ` +
      `${a.echeances_payees}/${a.nb_echeances} payées · prochaine=${a.prochaine_echeance ?? "—"}`,
  );
  for (const r of p ?? []) {
    console.log(
      `  éch.${r.numero_echeance ?? "?"} | ${String(r.montant).padStart(7)} € | ` +
        `${String(r.statut).padEnd(10)} | prévue ${r.date_prevue ?? "—"} | ` +
        `payée ${r.date_paiement ? String(r.date_paiement).slice(0, 10) : "—"} | ` +
        `PI ${r.stripe_payment_intent_id ?? "—"}`,
    );
  }
}

async function due() {
  // Plus petite échéance NON payée, NON encore tentée (PI null), numérotée ≥ 2.
  const { data: rows } = await supabase
    .from("paiements")
    .select("id, numero_echeance, statut, date_prevue, stripe_payment_intent_id")
    .eq("adherent_id", id)
    .in("statut", ["en_attente", "en_cours"])
    .is("stripe_payment_intent_id", null)
    .not("numero_echeance", "is", null)
    .order("numero_echeance", { ascending: true });

  const cible = (rows ?? []).find((r) => (r.numero_echeance ?? 0) >= 2);
  if (!cible) {
    console.log(
      "\n⚠️ Aucune échéance future éligible (en_attente, PI null, n°≥2). " +
        "Le dossier est-il bien un fractionné avec une 1ère échéance déjà payée ?",
    );
    return;
  }
  const { error } = await supabase
    .from("paiements")
    .update({ date_prevue: today })
    .eq("id", cible.id);
  if (error) {
    console.log("❌ Échec mise à jour date_prevue :", error.message);
    return;
  }
  console.log(
    `\n✅ Échéance n°${cible.numero_echeance} datée à aujourd'hui (${today}). ` +
      "Montant inchangé. Déclenche maintenant le cron pour la prélever.",
  );
}

await etat("AVANT");
if (action === "due") {
  await due();
  await etat("APRÈS");
} else if (action !== "show") {
  console.log(`\nAction inconnue : ${action} (attendu : show | due)`);
}
