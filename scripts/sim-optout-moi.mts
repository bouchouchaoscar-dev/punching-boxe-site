// Simulation d'exclusion d'un email réel, en reproduisant EXACTEMENT la logique
// de send-campagne (smart list "tous" → map dédoublonnée par email → exclusion).
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

const EMAIL = "bouchoucha.oscar@gmail.com";

// Reproduit send-campagne : adhérents → map<email_lower, recipient> (dédoublonné).
async function construireMap() {
  const { data } = await supabase.from("adherents").select("email, prenom, nom");
  const map = new Map<string, { email: string }>();
  let brut = 0;
  for (const a of data ?? []) {
    const key = String(a.email).trim().toLowerCase();
    if (!key) continue;
    brut++;
    if (!map.has(key)) map.set(key, { email: key });
  }
  return { map, brut };
}

async function exclure(map: Map<string, { email: string }>) {
  const { data: optouts } = await supabase
    .from("desinscriptions_mailing")
    .select("email");
  const desinscrits = new Set(
    (optouts ?? []).map((o) => String(o.email).toLowerCase()),
  );
  const restants = [...map.values()].filter((r) => !desinscrits.has(r.email));
  return { restants, exclus: map.size - restants.length };
}

const cible = EMAIL.toLowerCase();
let ok = 0, ko = 0;
const check = (l: string, c: boolean, g?: unknown) => {
  if (c) { ok++; console.log(`  ✓ ${l}`); }
  else { ko++; console.log(`  ✗ ${l}` + (g !== undefined ? `  → ${g}` : "")); }
};

// --- Avant désinscription : l'email doit être destinataire ---
console.log("\n[avant désinscription]");
const a0 = await construireMap();
check("email présent dans les destinataires", a0.map.has(cible));
const e0 = await exclure(a0.map);
check("email NON exclu (pas encore désinscrit)", e0.restants.some((r) => r.email === cible));
console.log(`  destinataires=${e0.restants.length}, exclus=${e0.exclus}`);

// --- Désinscription ---
console.log("\n[désinscription]");
const ins = await supabase
  .from("desinscriptions_mailing")
  .upsert({ email: cible, source: "sim-test" }, { onConflict: "email" });
check("upsert OK", !ins.error, ins.error?.message);
const a1 = await construireMap();
const e1 = await exclure(a1.map);
check("email EXCLU de la campagne", !e1.restants.some((r) => r.email === cible));
check("exactement +1 exclu vs avant", e1.exclus === e0.exclus + 1, `avant=${e0.exclus} après=${e1.exclus}`);
check("les autres destinataires conservés", e1.restants.length === e0.restants.length - 1);
console.log(`  destinataires=${e1.restants.length}, exclus=${e1.exclus}`);

// --- Réabonnement (delete) ---
console.log("\n[réabonnement]");
const del = await supabase.from("desinscriptions_mailing").delete().eq("email", cible);
check("delete OK", !del.error, del.error?.message);
const a2 = await construireMap();
const e2 = await exclure(a2.map);
check("email RÉ-INCLUS dans la campagne", e2.restants.some((r) => r.email === cible));
check("retour au compte d'exclus initial", e2.exclus === e0.exclus, `${e2.exclus} vs ${e0.exclus}`);
console.log(`  destinataires=${e2.restants.length}, exclus=${e2.exclus}`);

console.log(`\nRésultat : ${ok} OK / ${ko} KO`);
console.log("État final : ton email est RÉABONNÉ (ligne supprimée).");
process.exit(ko === 0 ? 0 : 1);
