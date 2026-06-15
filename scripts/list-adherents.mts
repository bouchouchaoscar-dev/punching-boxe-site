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
const { data } = await supabase
  .from("adherents")
  .select("id, prenom, nom, email, mode_paiement, nb_echeances, echeances_payees, statut_paiement, titulaire_id")
  .order("created_at", { ascending: false });
console.log(`Total : ${data?.length ?? 0}`);
for (const a of data ?? []) {
  console.log(
    `${a.id} | ${a.prenom} ${a.nom} | ${a.email} | ${a.mode_paiement} ${a.echeances_payees}/${a.nb_echeances} | ${a.statut_paiement} | tit=${a.titulaire_id ? "oui" : "non"}`,
  );
}
