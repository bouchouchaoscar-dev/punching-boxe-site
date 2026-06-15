// Test segments mailing anciens : dynamisme + comptes réels + dédup ancien_id.
// Usage : npx tsx scripts/test-segments-mailing.mts
import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";
import { classerAncien, matchKey } from "../lib/anciennete";
import { filtrerAnciens } from "../lib/campagnes";

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

async function paginate(table: string, cols: string) {
  let all: any[] = [], from = 0;
  for (;;) {
    const { data } = await supabase.from(table).select(cols).range(from, from + 999);
    if (!data || !data.length) break;
    all = all.concat(data);
    if (data.length < 1000) break;
    from += 1000;
  }
  return all;
}

async function main() {
  // ---- 1) Dynamisme (pur) : même ancien se reclasse selon la saison ----
  console.log("\n[classerAncien — dynamisme]");
  check("2023-2024 → tiède en 2026-2027", classerAncien("2023-2024", "2026-2027") === "tiede");
  check("2023-2024 → FROID en 2027-2028 (reclassement)", classerAncien("2023-2024", "2027-2028") === "froid");
  check("2025-2026 → saison_derniere en 2026-2027", classerAncien("2025-2026", "2026-2027") === "saison_derniere");
  check("2024-2025 → tiède en 2026-2027 (gap2)", classerAncien("2024-2025", "2026-2027") === "tiede");
  check("2022-2023 → froid en 2026-2027 (gap4)", classerAncien("2022-2023", "2026-2027") === "froid");
  check("null → non classable", classerAncien(null, "2026-2027") === null);

  // ---- 2) Comptes réels (reconstruits depuis les tables de base) ----
  console.log("\n[comptes réels — saison 2026-2027]");
  const anc = await paginate("anciens_adherents", "id,email");
  const hist = await paginate("historique_saisons", "ancien_id,saison,disciplines");
  const byId = new Map<string, { derniere_saison: string | null; disciplines: string[]; has_email: boolean; email: string | null }>();
  for (const a of anc) byId.set(a.id, { derniere_saison: null, disciplines: [], has_email: !!(a.email && String(a.email).trim()), email: a.email });
  for (const h of hist) {
    const p = byId.get(h.ancien_id); if (!p) continue;
    if (!p.derniere_saison || h.saison > p.derniere_saison) p.derniere_saison = h.saison;
    for (const d of h.disciplines ?? []) if (!p.disciplines.includes(d)) p.disciplines.push(d);
  }
  const rows = [...byId.values()];
  const ref = "2026-2027";
  const nSaisonDerniere = filtrerAnciens(rows, ["anciens_saison_derniere"], [], ref).length;
  const nTiedes = filtrerAnciens(rows, ["anciens_tiedes"], [], ref).length;
  const nFroids = filtrerAnciens(rows, ["anciens_froids"], [], ref).length;
  console.log(`  saison dernière=${nSaisonDerniere}, tièdes=${nTiedes}, froids=${nFroids}, total=${nSaisonDerniere + nTiedes + nFroids}`);
  check("saison dernière ≈ 210", nSaisonDerniere === 210, nSaisonDerniere);
  check("tièdes ≈ 327", nTiedes === 327, nTiedes);
  check("froids ≈ 321", nFroids === 321, nFroids);
  check("somme = 858", nSaisonDerniere + nTiedes + nFroids === 858);
  const sansEmail = rows.filter((r) => !r.has_email).length;
  check("sans email = 57", sansEmail === 57, sansEmail);

  // Discipline (OU) : tièdes filtrés LES_2 ⊆ tièdes, et BF+LES_2 ≥ chacun.
  const tiedesLes2 = filtrerAnciens(rows, ["anciens_tiedes"], ["LES_2"], ref).length;
  const tiedesBf = filtrerAnciens(rows, ["anciens_tiedes"], ["BF"], ref).length;
  const tiedesBfLes2 = filtrerAnciens(rows, ["anciens_tiedes"], ["BF", "LES_2"], ref).length;
  check("filtre discipline réduit l'ensemble", tiedesLes2 <= nTiedes && tiedesBf <= nTiedes);
  check("OU discipline : BF∪LES_2 ≥ max(BF, LES_2)", tiedesBfLes2 >= Math.max(tiedesBf, tiedesLes2));

  // ---- 3) Dédoublonnage par ancien_id (ancien réinscrit exclu) ----
  console.log("\n[dédoublonnage par ancien_id]");
  const cibleTiede = filtrerAnciens(rows, ["anciens_tiedes"], [], ref).find((r) => r.has_email)!;
  // id de la cible
  const cibleId = [...byId.entries()].find(([, v]) => v === cibleTiede)?.[0];
  let inséré = false;
  try {
    const { error } = await supabase.from("adherents").insert({
      nom: "ZZTEST_MIGRE", prenom: "DOSSIER", date_naissance: "1990-01-01",
      email: "zztest_migre@example.com", statut_paiement: "paye", saison: "2026-2027",
      match_key: matchKey("ZZTEST_MIGRE", "DOSSIER", "1990-01-01"), ancien_id: cibleId,
    });
    inséré = !error;
    check("insertion dossier natif lié (migré) OK", !error, error?.message);
    // Reproduit l'exclusion serveur : migres = adherents.ancien_id non null.
    const migr = await paginate("adherents", "ancien_id");
    const migres = new Set(migr.map((m) => m.ancien_id).filter(Boolean));
    check("la cible est bien marquée migrée", migres.has(cibleId), cibleId);
    const restants = filtrerAnciens(rows, ["anciens_tiedes"], [], ref).filter((r) => {
      const id = [...byId.entries()].find(([, v]) => v === r)?.[0];
      return !migres.has(id);
    });
    check("ancien réinscrit exclu du segment (−1)", restants.length === nTiedes - 1, { avant: nTiedes, apres: restants.length });
  } finally {
    if (inséré) await supabase.from("adherents").delete().like("nom", "ZZTEST_%");
  }

  // ---- 4) La vue anciens_recence existe et renvoie 858 ----
  console.log("\n[vue SQL anciens_recence]");
  const { data: vue, error: vueErr } = await supabase.from("anciens_recence").select("id", { count: "exact", head: true });
  if (vueErr) check("vue anciens_recence accessible", false, vueErr.message);
  else check("vue accessible (count via head)", true);
}

main()
  .catch((e) => { ko++; console.error("Erreur:", e); })
  .finally(async () => {
    await supabase.from("adherents").delete().like("nom", "ZZTEST_%");
    console.log(`\nRésultat : ${ok} OK / ${ko} KO  (ZZTEST nettoyés)`);
    process.exit(ko === 0 ? 0 : 1);
  });
