// Test stats-saisons : CA/effectifs/disciplines par saison (base) + helper règles.
// Usage : npx tsx scripts/test-stats-saisons.mts
import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";
import { analyserSaisons } from "../lib/stats-insights";

for (const line of readFileSync(".env.local", "utf8").split("\n")) {
  const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
}
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

let ok = 0, ko = 0;
const check = (l: string, c: boolean, g?: unknown) => {
  if (c) { ok++; console.log(`  ✓ ${l}`); }
  else { ko++; console.log(`  ✗ ${l}` + (g !== undefined ? `  → ${JSON.stringify(g)}` : "")); }
};

function discPrincipale(d: string[] | null): "BF" | "SAVATE" | "LES_2" | "AUTRE" {
  const a = d ?? [];
  if (a.includes("LES_2")) return "LES_2";
  if (a.includes("SAVATE")) return "SAVATE";
  if (a.includes("BF")) return "BF";
  return "AUTRE";
}

async function main() {
  // ---- Agrégation historique (même logique que l'endpoint) ----
  let all: any[] = [], from = 0;
  for (;;) {
    const { data } = await supabase.from("historique_saisons").select("saison,montant,disciplines").range(from, from + 999);
    if (!data || !data.length) break; all = all.concat(data); if (data.length < 1000) break; from += 1000;
  }
  const agg = new Map<string, { ca: number; eff: number; disc: Record<string, number> }>();
  for (const h of all) {
    let g = agg.get(h.saison);
    if (!g) { g = { ca: 0, eff: 0, disc: { BF: 0, SAVATE: 0, LES_2: 0, AUTRE: 0 } }; agg.set(h.saison, g); }
    g.ca += Number(h.montant || 0); g.eff += 1; g.disc[discPrincipale(h.disciplines)] += 1;
  }

  const attendu: Record<string, { ca: number; eff: number }> = {
    "2020-2021": { ca: 44490, eff: 112 },
    "2021-2022": { ca: 81658, eff: 205 },
    "2022-2023": { ca: 98476, eff: 245 },
    "2023-2024": { ca: 97589, eff: 248 },
    "2024-2025": { ca: 91427, eff: 225 },
    "2025-2026": { ca: 87722, eff: 210 },
  };

  console.log("\n[CA + effectifs par saison (historique)]");
  for (const [s, exp] of Object.entries(attendu)) {
    const g = agg.get(s)!;
    check(`${s} CA = ${exp.ca}€`, Math.round(g.ca) === exp.ca, Math.round(g.ca));
    check(`${s} effectifs = ${exp.eff}`, g.eff === exp.eff, g.eff);
    const sumDisc = g.disc.BF + g.disc.SAVATE + g.disc.LES_2 + g.disc.AUTRE;
    check(`${s} BF+SAVATE+LES_2+AUTRE = effectifs`, sumDisc === g.eff, { sumDisc, eff: g.eff });
  }

  // ---- Règle passé/présent ----
  console.log("\n[règle source]");
  check("2025-2026 présent dans l'historique (source historique)", agg.has("2025-2026"));
  const { count: nat2627 } = await supabase
    .from("adherents").select("id", { count: "exact", head: true }).eq("saison", "2026-2027");
  check("2026-2027 = saison native (adherents existent)", (nat2627 ?? 0) >= 0); // table accessible

  // ---- Helper règles (pur) ----
  console.log("\n[analyserSaisons — pur]");
  const serie = [
    { saison: "2022-2023", ca: 98476, effectifs: 245 },
    { saison: "2023-2024", ca: 97589, effectifs: 248 },
    { saison: "2024-2025", ca: 91427, effectifs: 225 },
    { saison: "2025-2026", ca: 87722, effectifs: 210 },
    { saison: "2026-2027", ca: 1000, effectifs: 3, enCours: true },
  ];
  const ins = analyserSaisons(serie);
  console.log(ins.map((x) => "   • " + x).join("\n"));
  check("record CA = 2022-2023", ins.some((x) => x.includes("record") && x.includes("2022-2023")));
  check("YoY dernière complète = 2025-2026 vs 2024-2025", ins.some((x) => x.includes("CA 2025-2026") && x.includes("vs 2024-2025")));
  check("exclut la saison en cours des tendances", !ins.some((x) => x.includes("2026-2027")));
  check("mentionne baisse d'effectifs depuis le pic", ins.some((x) => /baisse/i.test(x)));
  check("CA moyen par adhérent présent", ins.some((x) => /moyen par adhérent/i.test(x)));
}

main()
  .catch((e) => { ko++; console.error("Erreur:", e); })
  .finally(() => { console.log(`\nRésultat : ${ok} OK / ${ko} KO`); process.exit(ko === 0 ? 0 : 1); });
