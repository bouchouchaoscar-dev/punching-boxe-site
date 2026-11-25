// [022] Rattrapage des essais passés : rattache tout essai non rattaché à son
// dossier par TRIPLET (matchKey), quel que soit le délai. Idempotent.
//   npx tsx scripts/rattrapage-essais.mts           → dryRun (n'écrit rien)
//   npx tsx scripts/rattrapage-essais.mts --apply    → applique (après GO)
import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";
import { matchKey } from "../lib/anciennete";
for (const line of readFileSync(".env.local", "utf8").split("\n")) {
  const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
}
const APPLY = process.argv.includes("--apply");
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

const { data: essais } = await sb
  .from("essais")
  .select("id, nom, prenom, date_naissance, date_seance, converti_dossier_id")
  .is("converti_dossier_id", null);
const { data: adhs } = await sb.from("adherents").select("id, nom, prenom, date_naissance");

// Index des dossiers par matchKey (plusieurs dossiers possibles → ambigu).
const parCle = new Map<string, { id: string; nom: string; prenom: string }[]>();
for (const a of adhs ?? []) {
  const k = matchKey(a.nom ?? "", a.prenom ?? "", a.date_naissance as string | null);
  if (!k) continue;
  (parCle.get(k) ?? parCle.set(k, []).get(k)!).push({ id: a.id, nom: a.nom, prenom: a.prenom });
}

const rattachables: { essaiId: string; nom: string; dateEssai: string; dossierId: string }[] = [];
const ambigus: { nom: string; dateEssai: string; dossiers: number }[] = [];
let sansDossier = 0, sansCle = 0;
for (const e of essais ?? []) {
  const k = matchKey(e.nom ?? "", e.prenom ?? "", e.date_naissance as string | null);
  if (!k) { sansCle++; continue; }
  const cands = parCle.get(k) ?? [];
  const uniques = [...new Set(cands.map((c) => c.id))];
  const nom = `${e.prenom ?? ""} ${e.nom ?? ""}`.trim();
  if (uniques.length === 0) sansDossier++;
  else if (uniques.length === 1) rattachables.push({ essaiId: e.id, nom, dateEssai: e.date_seance, dossierId: uniques[0] });
  else ambigus.push({ nom, dateEssai: e.date_seance, dossiers: uniques.length });
}

console.log(`\n=== RATTRAPAGE ESSAIS (${APPLY ? "APPLICATION" : "DRY RUN"}) ===`);
console.log(`Essais non rattachés : ${(essais ?? []).length}`);
console.log(`  → rattachables (1 dossier par triplet) : ${rattachables.length}`);
console.log(`  → ambigus (≥2 dossiers) : ${ambigus.length}`);
console.log(`  → sans dossier correspondant : ${sansDossier}`);
console.log(`  → sans date de naissance (non matchable) : ${sansCle}`);
console.log(`\nRattachables :`);
for (const r of rattachables) console.log(`   • ${r.nom} — essai ${r.dateEssai} → dossier ${r.dossierId}`);
if (ambigus.length) {
  console.log(`\n⚠ Ambigus (NON rattachés automatiquement) :`);
  for (const a of ambigus) console.log(`   • ${a.nom} — essai ${a.dateEssai} — ${a.dossiers} dossiers possibles`);
}

if (APPLY) {
  let n = 0;
  for (const r of rattachables) {
    const { error } = await sb.from("essais").update({ converti_dossier_id: r.dossierId }).eq("id", r.essaiId).is("converti_dossier_id", null);
    if (!error) n++;
  }
  console.log(`\n✅ Appliqué : ${n} essai(s) rattaché(s).`);
} else {
  console.log(`\n(DryRun : aucune écriture. Relancer avec --apply après GO.)`);
}
process.exit(0);
