// ============================================================================
// INIT NOUVEAU CLIENT — lit config-client.json et adapte le projet.
//   npx tsx scripts/init-nouveau-client.mts
// Best-effort + rapport clair (✅ fait / ⚠️ vérifier / ✋ manuel). Idempotent.
// NB : la couleur est dans app/globals.css (@theme, Tailwind v4) ; les infos
// club dans lib/constants.ts (objet CLUB) ; les tarifs dans lib/pricing.ts.
// ============================================================================
import { readFileSync, writeFileSync, existsSync } from "node:fs";

const log = { ok: (m: string) => console.log("  ✅ " + m), warn: (m: string) => console.log("  ⚠️  " + m), todo: (m: string) => console.log("  ✋ " + m) };
const CONFIG = "config-client.json";
if (!existsSync(CONFIG)) {
  console.error(`❌ ${CONFIG} introuvable. Copie config-client.example.json → config-client.json puis remplis-le.`);
  process.exit(1);
}
const cfg = JSON.parse(readFileSync(CONFIG, "utf8"));
const club = cfg.club ?? {};
const tarifs = cfg.tarifs ?? {};

// Remplace dans un fichier et renvoie true si au moins une substitution a eu lieu.
function patch(file: string, repls: { re: RegExp; to: string; label: string }[]) {
  if (!existsSync(file)) { log.warn(`${file} absent — ignoré`); return; }
  let s = readFileSync(file, "utf8");
  for (const { re, to, label } of repls) {
    if (re.test(s)) { s = s.replace(re, to); log.ok(`${file} → ${label}`); }
    else log.warn(`${file} → motif introuvable: ${label} (à vérifier manuellement)`);
  }
  writeFileSync(file, s);
}
// Patch ciblé À L'INTÉRIEUR d'un bloc délimité (évite les collisions de clés).
function patchBlock(file: string, blockRe: RegExp, repls: { re: RegExp; to: string; label: string }[]) {
  if (!existsSync(file)) { log.warn(`${file} absent — ignoré`); return; }
  let s = readFileSync(file, "utf8");
  const m = s.match(blockRe);
  if (!m) { log.warn(`${file} → bloc introuvable, patch ignoré`); return; }
  let block = m[0];
  for (const { re, to, label } of repls) {
    if (re.test(block)) { block = block.replace(re, to); log.ok(`${file} → ${label}`); }
    else log.warn(`${file} → ${label} introuvable`);
  }
  writeFileSync(file, s.replace(blockRe, block));
}
const q = (v: unknown) => JSON.stringify(v ?? "");

console.log("\n=== 1) Couleurs (app/globals.css @theme) ===");
patch("app/globals.css", [
  { re: /--color-orange:\s*#[0-9a-fA-F]{3,8};/, to: `--color-orange: ${club.couleur_principale ?? "#FF6B00"};`, label: "couleur principale" },
  { re: /--color-orange-600:\s*#[0-9a-fA-F]{3,8};/, to: `--color-orange-600: ${club.couleur_principale_600 ?? "#EA5F00"};`, label: "couleur 600" },
  { re: /--color-orange-50:\s*#[0-9a-fA-F]{3,8};/, to: `--color-orange-50: ${club.couleur_principale_50 ?? "#FFF4EC"};`, label: "couleur 50" },
]);

console.log("\n=== 2) Infos club (lib/constants.ts → CLUB) ===");
patchBlock("lib/constants.ts", /export const CLUB = \{[\s\S]*?\} as const;/, [
  { re: /(\bnom:\s*)"[^"]*"/, to: `$1${q(club.nom)}`, label: "nom" },
  { re: /(\bnomCourt:\s*)"[^"]*"/, to: `$1${q(club.nomCourt)}`, label: "nomCourt" },
  { re: /(\bsigle:\s*)"[^"]*"/, to: `$1${q(club.sigle)}`, label: "sigle" },
  { re: /(\bbaseline:\s*)"[^"]*"/, to: `$1${q(club.sport)}`, label: "baseline/sport" },
  { re: /(\btelephone:\s*)"[^"]*"/, to: `$1${q(club.telephone)}`, label: "telephone" },
  { re: /(\btelephoneHref:\s*)"[^"]*"/, to: `$1${q(club.telephoneHref)}`, label: "telephoneHref" },
  { re: /(\bemail:\s*)"[^"]*"/, to: `$1${q(club.email)}`, label: "email" },
  { re: /(\badresse:\s*)"[^"]*"/, to: `$1${q(`${club.adresse}, ${club.code_postal} ${club.ville}`)}`, label: "adresse" },
  { re: /(\bdirecteur:\s*)"[^"]*"/, to: `$1${q(club.directeur)}`, label: "directeur" },
  { re: /(\bdirecteurTitre:\s*)"[^"]*"/, to: `$1${q(club.directeurTitre)}`, label: "directeurTitre" },
  { re: /(\bsaison:\s*)"[^"]*"/, to: `$1${q(cfg.saison)}`, label: "saison" },
  { re: /(\bfacebook:\s*)"[^"]*"/, to: `$1${q(club.facebook)}`, label: "facebook" },
  { re: /(\binstagram:\s*)"[^"]*"/, to: `$1${q(club.instagram)}`, label: "instagram" },
]);

console.log("\n=== 3) Tarifs (lib/pricing.ts → TARIFS) ===");
const bf = (tarifs.formules ?? []).find((f: any) => f.id === "boxe_classique");
const sp = (tarifs.formules ?? []).find((f: any) => f.id === "savate_prepa");
patchBlock("lib/pricing.ts", /export const TARIFS = \{[\s\S]*?\} as const;/, [
  { re: /(adhesion:\s*)\d+/, to: `$1${tarifs.adhesion ?? 30}`, label: "adhésion" },
  { re: /(prepaPhysique:\s*)\d+/, to: `$1${tarifs.option_prepa ?? 70}`, label: "option prépa" },
  ...(bf ? [{ re: /(boxe_classique:\s*\{\s*adulte:\s*)\d+(,\s*jeune:\s*)\d+/, to: `$1${bf.adulte}$2${bf.jeune}`, label: "cotisation Boxe Française" }] : []),
  ...(sp ? [{ re: /(savate_prepa:\s*\{\s*adulte:\s*)\d+(,\s*jeune:\s*)\d+/, to: `$1${sp.adulte}$2${sp.jeune}`, label: "cotisation Savate & Prépa" }] : []),
]);

console.log("\n=== 4) Seuils d'âge (lib/pricing.ts) ===");
patch("lib/pricing.ts", [
  { re: /(SEUIL_JEUNE_ANS = )\d+/, to: `$1${cfg.seuils_age?.jeune_adulte ?? 13}`, label: "seuil jeune/adulte" },
  { re: /(SEUIL_MAJORITE_ANS = )\d+/, to: `$1${cfg.seuils_age?.majorite ?? 18}`, label: "seuil majorité" },
]);

console.log("\n=== 5) .env.example ===");
const adm = cfg.admin ?? {};
patch(".env.example", [
  { re: /NEXT_PUBLIC_SITE_URL=.*/, to: `NEXT_PUBLIC_SITE_URL=${club.site_url ?? ""}`, label: "SITE_URL" },
  { re: /RESEND_FROM=.*/, to: `RESEND_FROM=${club.nomCourt ?? "Club"} <${club.email ?? ""}>`, label: "RESEND_FROM" },
  { re: /ADMIN_NOTIFY_EMAIL=.*/, to: `ADMIN_NOTIFY_EMAIL=${adm.notify_email ?? club.email ?? ""}`, label: "ADMIN_NOTIFY_EMAIL" },
  { re: /NEXT_PUBLIC_ADMIN_USERNAME=.*/, to: `NEXT_PUBLIC_ADMIN_USERNAME=${adm.username ?? "admin"}`, label: "ADMIN_USERNAME" },
]);

console.log("\n=== 6) SEO (app/layout.tsx) ===");
log.todo("Titre/description/keywords SEO : à adapter manuellement dans app/layout.tsx (spécifiques au métier/ville).");

console.log("\n================ RESTE MANUEL ================");
for (const m of cfg._manuel ?? []) log.todo(m);
log.todo("Modèles d'emails : seedés automatiquement au 1er chargement de l'espace admin (aucune action). Admin : via NEXT_PUBLIC_ADMIN_USERNAME + ADMIN_PASSWORD.");
log.todo("Schéma base : exécuter supabase/migrations/001_schema_complet.sql (puis 004) dans Supabase");
log.todo("Vérif finale : npx tsx scripts/check-deployment.mts");
console.log("\n✔ Initialisation terminée. Lance `npm run build` pour valider.");
