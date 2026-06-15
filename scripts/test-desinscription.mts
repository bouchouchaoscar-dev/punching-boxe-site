// Test logique désinscription : token HMAC (round-trip + falsification) + exclusion DB.
// Usage : npx tsx scripts/test-desinscription.mts
import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";
import {
  unsubscribeUrl,
  verifierToken,
  encoderEmail,
  normaliserEmail,
} from "../lib/unsubscribe";

for (const line of readFileSync(".env.local", "utf8").split("\n")) {
  const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
}

let ok = 0;
let ko = 0;
const check = (label: string, cond: boolean, got?: unknown) => {
  if (cond) {
    ok++;
    console.log(`  ✓ ${label}`);
  } else {
    ko++;
    console.log(`  ✗ ${label}` + (got !== undefined ? `  → ${got}` : ""));
  }
};

// ---- 1) Token HMAC ----
console.log("\n[token HMAC]");
const email = "Famille.Test@Example.com";
const url = unsubscribeUrl(email);
const u = new URL(url);
const e = u.searchParams.get("e")!;
const t = u.searchParams.get("t")!;

check("URL contient e + t", !!e && !!t);
check("round-trip valide → email normalisé", verifierToken(e, t) === normaliserEmail(email), verifierToken(e, t));
check("token falsifié rejeté", verifierToken(e, t + "x") === null);
check("email falsifié (même token) rejeté", verifierToken(encoderEmail("autre@example.com"), t) === null);
check("casse/espaces ignorés (même token)", verifierToken(encoderEmail("  famille.test@example.com "), t) === normaliserEmail(email));
check("token vide rejeté", verifierToken(e, "") === null);

// ---- 2) Exclusion en base (intégration prod, avec nettoyage) ----
console.log("\n[exclusion DB]");
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);
const testEmail = `optout-test-${Date.now()}@example.com`;

// État initial : absent.
const before = await supabase
  .from("desinscriptions_mailing")
  .select("email")
  .eq("email", testEmail)
  .maybeSingle();
check("table accessible", !before.error, before.error?.message);
check("email absent au départ", !before.data);

// Désinscription (upsert).
const ins = await supabase
  .from("desinscriptions_mailing")
  .upsert({ email: testEmail, source: "test" }, { onConflict: "email" });
check("upsert désinscription OK", !ins.error, ins.error?.message);

// Reproduit l'exclusion du route send-campagne.
const { data: optouts } = await supabase
  .from("desinscriptions_mailing")
  .select("email");
const desinscrits = new Set((optouts ?? []).map((o) => String(o.email).toLowerCase()));
const recipients = [
  { email: "garde1@example.com" },
  { email: testEmail },
  { email: "garde2@example.com" },
];
const restants = recipients.filter((r) => !desinscrits.has(r.email));
check("le désinscrit est exclu", !restants.some((r) => r.email === testEmail));
check("les autres restent", restants.length === 2);

// Réinscription (delete).
const del = await supabase.from("desinscriptions_mailing").delete().eq("email", testEmail);
check("réinscription (delete) OK", !del.error, del.error?.message);
const after = await supabase
  .from("desinscriptions_mailing")
  .select("email")
  .eq("email", testEmail)
  .maybeSingle();
check("email ré-inclus après réinscription", !after.data);

console.log(`\nRésultat : ${ok} OK / ${ko} KO`);
process.exit(ko === 0 ? 0 : 1);
