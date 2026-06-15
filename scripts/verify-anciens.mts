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

const c = async (table: string, filter?: (q: any) => any) => {
  let q = supabase.from(table).select("id", { count: "exact", head: true });
  if (filter) q = filter(q);
  const { count } = await q;
  return count ?? 0;
};

console.log("=== Compteurs ===");
console.log("anciens_adherents      :", await c("anciens_adherents"));
console.log("historique_saisons     :", await c("historique_saisons"));
console.log("a_verifier = true      :", await c("anciens_adherents", (q) => q.eq("a_verifier", true)));
console.log("match_key NULL         :", await c("anciens_adherents", (q) => q.is("match_key", null)));

// Lignes d'historique par personne (agrégé en JS).
const { data: hist } = await supabase
  .from("historique_saisons")
  .select("ancien_id, saison, disciplines");
const parPersonne = new Map<string, number>();
for (const h of hist ?? []) parPersonne.set(h.ancien_id, (parPersonne.get(h.ancien_id) ?? 0) + 1);
const distrib = new Map<number, number>();
for (const n of parPersonne.values()) distrib.set(n, (distrib.get(n) ?? 0) + 1);
console.log("\n=== Nb de saisons par personne ===");
for (const [n, combien] of [...distrib.entries()].sort((a, b) => a[0] - b[0]))
  console.log(`  ${n} saison(s) : ${combien} personnes`);

// Top : la personne avec le plus de saisons.
const topId = [...parPersonne.entries()].sort((a, b) => b[1] - a[1])[0]?.[0];

async function montrer(nom: string, prenom?: string) {
  let q = supabase.from("anciens_adherents").select("id, nom, prenom, date_naissance, email, match_key, a_verifier").eq("nom", nom);
  if (prenom) q = q.eq("prenom", prenom);
  const { data } = await q;
  for (const p of data ?? []) {
    const { data: h } = await supabase
      .from("historique_saisons")
      .select("saison, disciplines")
      .eq("ancien_id", p.id)
      .order("saison");
    console.log(`\n${p.nom} ${p.prenom}  (né ${p.date_naissance ?? "?"}, ${p.email ?? "sans email"})${p.a_verifier ? "  [A_VERIFIER]" : ""}`);
    console.log(`  match_key: ${p.match_key ?? "NULL"}`);
    for (const x of h ?? []) console.log(`   - ${x.saison} : ${x.disciplines.join(", ")}`);
  }
}

console.log("\n=== Exemple : personne avec le plus de saisons ===");
if (topId) {
  const { data: tp } = await supabase
    .from("anciens_adherents")
    .select("nom, prenom")
    .eq("id", topId)
    .single();
  if (tp) await montrer(tp.nom, tp.prenom);
}

console.log("\n=== Exemple : discipline qui change selon les saisons ===");
await montrer("AICHI", "FARAH"); // LES 2 puis BF selon l'année (sera 'AÃCHI' si accent conservé)
await montrer("DECAUDIN", "CHRYSTELE");

console.log("\n=== Exemple : cas a_verifier (naissance incohérente) ===");
await montrer("ARBOUCHE", "ADAM");
