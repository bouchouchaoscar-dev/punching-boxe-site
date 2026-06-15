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
const { data } = await supabase.from("adherents").select("saison");
const counts = new Map<string, number>();
for (const r of data ?? []) {
  const k = r.saison ?? "(null)";
  counts.set(k, (counts.get(k) ?? 0) + 1);
}
console.log("Répartition par saison :");
for (const [k, v] of [...counts.entries()].sort()) console.log(`  ${k} : ${v}`);
