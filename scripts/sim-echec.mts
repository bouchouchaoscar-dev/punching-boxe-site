// Simulation visuelle des 3 familles d'échec sur un dossier de test.
// Usage : npx tsx scripts/sim-echec.mts <show|provision|carte_morte|autre|restore>
import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";

// Charge .env.local sans dépendance.
for (const line of readFileSync(".env.local", "utf8").split("\n")) {
  const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
}
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

const ID = "6a5eda45-d56c-4c5a-bdf0-334552ea4204"; // BIYUBi
const BACKUP = "scripts/.biyubi-backup.json";

const FIELDS = [
  "statut_paiement",
  "echeances_payees",
  "derniere_erreur_stripe",
  "derniere_erreur_code",
] as const;

const action = process.argv[2] ?? "show";

async function show() {
  const { data, error } = await supabase
    .from("adherents")
    .select("prenom, nom, mode_paiement, nb_echeances, " + FIELDS.join(", "))
    .eq("id", ID)
    .maybeSingle();
  if (error) console.log("ERREUR:", error.message);
  console.log(JSON.stringify(data, null, 2));
}

async function backup() {
  const { writeFileSync, existsSync } = await import("node:fs");
  if (existsSync(BACKUP)) return; // ne pas écraser une sauvegarde existante
  const { data } = await supabase
    .from("adherents")
    .select(FIELDS.join(", "))
    .eq("id", ID)
    .single();
  writeFileSync(BACKUP, JSON.stringify(data, null, 2));
  console.log("Sauvegarde écrite :", BACKUP, data);
}

async function setFamille(code: string, message: string) {
  await backup();
  // BIYUBi est déjà engagé (3/4 payées) → on ne touche PAS echeances_payees,
  // on ne change que le statut + la cause de l'échec.
  await supabase
    .from("adherents")
    .update({
      statut_paiement: "echec_paiement",
      derniere_erreur_stripe: message,
      derniere_erreur_code: code,
    })
    .eq("id", ID);
  console.log(`OK → ${code}`);
  await show();
}

async function restore() {
  const { readFileSync: rf, existsSync, unlinkSync } = await import("node:fs");
  if (!existsSync(BACKUP)) {
    console.log("Aucune sauvegarde à restaurer.");
    return;
  }
  const orig = JSON.parse(rf(BACKUP, "utf8"));
  await supabase.from("adherents").update(orig).eq("id", ID);
  unlinkSync(BACKUP);
  console.log("État d'origine restauré :", orig);
  await show();
}

switch (action) {
  case "provision":
    await setFamille("insufficient_funds", "Your card has insufficient funds.");
    break;
  case "carte_morte":
    await setFamille("expired_card", "Your card has expired.");
    break;
  case "autre":
    await setFamille("do_not_honor", "Your card was declined.");
    break;
  case "restore":
    await restore();
    break;
  default:
    await show();
}
