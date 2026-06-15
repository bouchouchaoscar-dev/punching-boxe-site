// Test ancienneté : helpers purs + 6 cas d'intégration DB (données ZZTEST_, nettoyées).
// Usage : npx tsx scripts/test-anciennete.mts
import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";
import {
  matchKey,
  doitPayerAdhesion,
  evaluerAnciennete,
} from "../lib/anciennete";

for (const line of readFileSync(".env.local", "utf8").split("\n")) {
  const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
}
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

let ok = 0,
  ko = 0;
const check = (l: string, c: boolean, g?: unknown) => {
  if (c) { ok++; console.log(`  ✓ ${l}`); }
  else { ko++; console.log(`  ✗ ${l}` + (g !== undefined ? `  → ${JSON.stringify(g)}` : "")); }
};

const SAISON = "2026-2027";

async function main() {
  // ---- Helpers purs : règle 30€ ----
  console.log("\n[doitPayerAdhesion]");
  check("2025-2026 → gap1 → gratuit", doitPayerAdhesion("2025-2026", SAISON) === false);
  check("2024-2025 → gap2 → gratuit", doitPayerAdhesion("2024-2025", SAISON) === false);
  check("2023-2024 → gap3 → gratuit", doitPayerAdhesion("2023-2024", SAISON) === false);
  check("2022-2023 → gap4 → 30€", doitPayerAdhesion("2022-2023", SAISON) === true);
  check("null → 30€ (nouveau)", doitPayerAdhesion(null, SAISON) === true);

  // ---- Helpers purs : matchKey ----
  console.log("\n[matchKey]");
  check("clé simple", matchKey("JACON", "SEBASTIEN", "1984-08-31") === "jacon|sebastien|1984-08-31");
  check("accents retirés", matchKey("PÉRIS", "LISE", "1979-12-09") === "peris|lise|1979-12-09");
  check("suffixe GR (nom) retiré", matchKey("DUPONT GR", "RENAUD", "1980-09-18") === "dupont|renaud|1980-09-18");
  check("date JJ/MM/AAAA normalisée", matchKey("X", "Y", "31/08/1984") === "x|y|1984-08-31");
  check("sans naissance → null", matchKey("X", "Y", "") === null);

  // ---- Intégration DB ----
  console.log("\n[evaluerAnciennete — intégration]");

  // 1) Nouveau pur (identité inconnue).
  const e1 = await evaluerAnciennete(supabase, { nom: "ZZTEST_NOUVEAU", prenom: "PERSONNE", date_naissance: "2000-01-01" }, SAISON);
  check("nouveau pur → paieAdhesion true", e1.paieAdhesion === true, e1);
  check("nouveau pur → ancienId null", e1.ancienId === null);
  check("nouveau pur → motif nouveau", e1.motif === "nouveau");

  // 2) Ancien récent (historique 2024-2025).
  const k2 = matchKey("ZZTEST_RECENT", "ANCIEN", "1990-05-05");
  const { data: a2 } = await supabase.from("anciens_adherents").insert({ nom: "ZZTEST_RECENT", prenom: "ANCIEN", date_naissance: "1990-05-05", match_key: k2, source: "zztest" }).select("id").single();
  await supabase.from("historique_saisons").insert({ ancien_id: a2!.id, saison: "2024-2025", disciplines: ["BF"] });
  const e2 = await evaluerAnciennete(supabase, { nom: "ZZTEST_RECENT", prenom: "ANCIEN", date_naissance: "1990-05-05" }, SAISON);
  check("ancien récent → gratuit", e2.paieAdhesion === false, e2);
  check("ancien récent → ancienId posé", e2.ancienId === a2!.id);
  check("ancien récent → motif ancien_recent", e2.motif === "ancien_recent");

  // 3) Ancien éloigné (historique 2021-2022 → gap 5).
  const k3 = matchKey("ZZTEST_ELOIGNE", "ANCIEN", "1985-03-03");
  const { data: a3 } = await supabase.from("anciens_adherents").insert({ nom: "ZZTEST_ELOIGNE", prenom: "ANCIEN", date_naissance: "1985-03-03", match_key: k3, source: "zztest" }).select("id").single();
  await supabase.from("historique_saisons").insert({ ancien_id: a3!.id, saison: "2021-2022", disciplines: ["BF"] });
  const e3 = await evaluerAnciennete(supabase, { nom: "ZZTEST_ELOIGNE", prenom: "ANCIEN", date_naissance: "1985-03-03" }, SAISON);
  check("ancien éloigné → 30€", e3.paieAdhesion === true, e3);
  check("ancien éloigné → motif ancien_eloigne", e3.motif === "ancien_eloigne");

  // 4) Historique NATIF (adherents payé 2025-2026, même identité) → fusion.
  const k4 = matchKey("ZZTEST_NATIF", "DOSSIER", "1995-07-07");
  const { data: a4 } = await supabase.from("adherents").insert({ nom: "ZZTEST_NATIF", prenom: "DOSSIER", date_naissance: "1995-07-07", email: "zztest_natif@example.com", statut_paiement: "paye", saison: "2025-2026", match_key: k4 }).select("id").single();
  const e4 = await evaluerAnciennete(supabase, { nom: "ZZTEST_NATIF", prenom: "DOSSIER", date_naissance: "1995-07-07" }, SAISON);
  check("natif payé récent → gratuit (fusion natif)", e4.paieAdhesion === false, e4);

  // 5) Ambigu (2 anciens même clé : 2024-2025 et 2022-2023).
  const k5 = matchKey("ZZTEST_AMBIGU", "DOUBLON", "2001-02-02");
  const { data: a5a } = await supabase.from("anciens_adherents").insert({ nom: "ZZTEST_AMBIGU", prenom: "DOUBLON", date_naissance: "2001-02-02", match_key: k5, source: "zztest" }).select("id").single();
  const { data: a5b } = await supabase.from("anciens_adherents").insert({ nom: "ZZTEST_AMBIGU", prenom: "DOUBLON", date_naissance: "2001-02-02", match_key: k5, source: "zztest" }).select("id").single();
  await supabase.from("historique_saisons").insert({ ancien_id: a5a!.id, saison: "2024-2025", disciplines: ["BF"] });
  await supabase.from("historique_saisons").insert({ ancien_id: a5b!.id, saison: "2022-2023", disciplines: ["BF"] });
  const e5 = await evaluerAnciennete(supabase, { nom: "ZZTEST_AMBIGU", prenom: "DOUBLON", date_naissance: "2001-02-02" }, SAISON);
  check("ambigu → flag ambigu true", e5.ambigu === true, e5);
  check("ambigu → ancienId null (pas de lien ferme)", e5.ancienId === null);
  check("ambigu → bénéfice du doute (saison récente 2024-2025 → gratuit)", e5.paieAdhesion === false, e5);
  check("ambigu → motif ambigu", e5.motif === "ambigu");

  // 6) Sans naissance → pas de match.
  const e6 = await evaluerAnciennete(supabase, { nom: "ZZTEST_RECENT", prenom: "ANCIEN", date_naissance: null }, SAISON);
  check("sans naissance → matchKey null", e6.matchKey === null);
  check("sans naissance → paieAdhesion true (jamais matché)", e6.paieAdhesion === true);
  check("sans naissance → ancienId null", e6.ancienId === null);
}

main()
  .catch((e) => { ko++; console.error("Erreur:", e); })
  .finally(async () => {
    // Nettoyage systématique.
    await supabase.from("anciens_adherents").delete().like("nom", "ZZTEST_%"); // cascade historique
    await supabase.from("adherents").delete().like("nom", "ZZTEST_%");
    console.log(`\nRésultat : ${ok} OK / ${ko} KO  (données ZZTEST_ nettoyées)`);
    process.exit(ko === 0 ? 0 : 1);
  });
