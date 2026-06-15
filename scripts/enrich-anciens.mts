// Enrichit historique_saisons (montant / mode_reglement / date_validation) à
// partir de data/anciens_adherents_enrichi.csv, SANS créer de doublons ni de
// nouvelles personnes : met seulement à jour les lignes EXISTANTES.
//   DRY-RUN : npx tsx scripts/enrich-anciens.mts
//   COMMIT  : npx tsx scripts/enrich-anciens.mts --commit
import { readFileSync, existsSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";
import { matchKey, sansAccents } from "../lib/anciennete";

const FICHIER = "data/anciens_adherents_enrichi.csv";
const COMMIT = process.argv.includes("--commit");
if (!existsSync(FICHIER)) {
  console.error(`Fichier introuvable : ${FICHIER}`);
  process.exit(1);
}
for (const line of readFileSync(".env.local", "utf8").split("\n")) {
  const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
}
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

function parseLigne(line: string): string[] {
  const out: string[] = []; let cur = ""; let inQ = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (c === '"') { if (inQ && line[i + 1] === '"') { cur += '"'; i++; } else inQ = !inQ; }
    else if (c === "," && !inQ) { out.push(cur); cur = ""; }
    else cur += c;
  }
  out.push(cur); return out.map((s) => s.trim());
}
function parseMontant(s: string): number | null {
  const t = (s || "").replace(/\s/g, "").replace(/€/g, "").replace(",", ".");
  if (!t) return null;
  const n = Number(t);
  return Number.isFinite(n) ? n : null;
}
function normDate(s: string): string | null {
  const t = (s || "").trim(); if (!t) return null;
  let m = t.match(/^(\d{4})-(\d{2})-(\d{2})/); if (m) return `${m[1]}-${m[2]}-${m[3]}`;
  m = t.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/); if (m) return `${m[3]}-${m[2].padStart(2,"0")}-${m[1].padStart(2,"0")}`;
  return null;
}
const fallbackKey = (nom: string, prenom: string) =>
  `NN|${sansAccents(nom)}|${sansAccents(prenom)}`;

// ---- Lecture CSV ----
const lignes = readFileSync(FICHIER, "utf8").split(/\r?\n/).filter((l) => l.trim());
const header = parseLigne(lignes[0]).map((h) => h.toLowerCase());
const col = (...names: string[]) => header.findIndex((h) => names.some((n) => h.includes(n)));
const idx = {
  saison: col("saison"), nom: col("nom"), prenom: col("prenom", "prénom"),
  naissance: col("naiss"), montant: col("montant"),
  mode: col("mode", "reglement", "règlement", "banque"),
  date: col("date_validation", "validation", "essai"),
};

type Groupe = { montant: number; mode: string | null; date: string | null; key: string; keyFallback: string; nom: string; prenom: string; lignes: number };
const groupes = new Map<string, Groupe>(); // clé = matchKeyOuFallback + "@" + saison
let lignesData = 0, sansMontant = 0, parasites = 0;

for (let i = 1; i < lignes.length; i++) {
  const f = parseLigne(lignes[i]);
  const saison = f[idx.saison]?.trim();
  const nom = (f[idx.nom] ?? "").trim();
  const prenom = (f[idx.prenom] ?? "").trim();
  if (nom.toUpperCase() === "NOMS" || prenom.toUpperCase() === "PRENOMS") { parasites++; continue; }
  if (!saison || !nom) continue;
  lignesData++;
  const naissance = f[idx.naissance];
  const mk = matchKey(nom, prenom, naissance);
  const keyId = mk ?? fallbackKey(nom, prenom);
  const gkey = `${keyId}@${saison}`;
  const montant = parseMontant(f[idx.montant] ?? "");
  if (montant == null) sansMontant++;
  const mode = (f[idx.mode] ?? "").trim() || null;
  const date = normDate(f[idx.date] ?? "");
  let g = groupes.get(gkey);
  if (!g) { g = { montant: 0, mode, date, key: mk ?? "", keyFallback: keyId, nom, prenom, lignes: 0 }; groupes.set(gkey, g); }
  // UNE ligne = UNE personne = UN prix → on NE somme PAS ; on garde le plus élevé
  // (filet pour les rares cas à 2 lignes, ex. paiement famille sur une ligne).
  if ((montant ?? 0) > g.montant) g.montant = montant ?? 0;
  g.lignes++;
  if (!g.mode && mode) g.mode = mode;
  if (!g.date && date) g.date = date;
}

// ---- Lookup anciens (match_key + fallback nom/prénom) ----
async function paginate(table: string, cols: string) {
  let all: any[] = [], from = 0;
  for (;;) { const { data } = await supabase.from(table).select(cols).range(from, from + 999); if (!data || !data.length) break; all = all.concat(data); if (data.length < 1000) break; from += 1000; }
  return all;
}
const anc = await paginate("anciens_adherents", "id,nom,prenom,match_key");
const parMatchKey = new Map<string, string[]>();
const parNomPrenom = new Map<string, string[]>();
for (const a of anc) {
  if (a.match_key) (parMatchKey.get(a.match_key) ?? parMatchKey.set(a.match_key, []).get(a.match_key)!).push(a.id);
  const fk = fallbackKey(a.nom ?? "", a.prenom ?? "");
  (parNomPrenom.get(fk) ?? parNomPrenom.set(fk, []).get(fk)!).push(a.id);
}
// Dry-run indépendant du SQL : on ne lit PAS la colonne montant (peut ne pas
// exister encore). On ne récupère que l'existence de la ligne (id, ancien_id, saison).
const hist = await paginate("historique_saisons", "id,ancien_id,saison");
const histByKey = new Map<string, { id: string }>();
for (const h of hist) histByKey.set(`${h.ancien_id}@${h.saison}`, { id: h.id });

// ---- Résolution + rapport ----
const updates: { id: string; montant: number; mode: string | null; date: string | null }[] = [];
const caParSaison = new Map<string, number>();
let matched = 0, sansAncien = 0, ambigus = 0, sansHistorique = 0;
const exemplesNonMatch: string[] = [];

for (const [gkey, g] of groupes) {
  const saison = gkey.split("@")[1];
  let ids = g.key ? parMatchKey.get(g.key) ?? [] : [];
  if (ids.length === 0) ids = parNomPrenom.get(g.keyFallback) ?? [];
  if (ids.length === 0) { sansAncien++; if (exemplesNonMatch.length < 10) exemplesNonMatch.push(`${g.nom} ${g.prenom} [${saison}]`); continue; }
  if (ids.length > 1) ambigus++;
  const ancienId = ids[0];
  const h = histByKey.get(`${ancienId}@${saison}`);
  if (!h) { sansHistorique++; continue; }
  matched++;
  updates.push({ id: h.id, montant: g.montant, mode: g.mode, date: g.date });
  caParSaison.set(saison, (caParSaison.get(saison) ?? 0) + g.montant);
}

console.log(`\n=== ENRICHISSEMENT — ${COMMIT ? "COMMIT" : "DRY-RUN"} ===`);
console.log(`Lignes données : ${lignesData} | parasites ignorés : ${parasites} | lignes sans montant : ${sansMontant}`);
console.log(`Groupes (personne×saison) : ${groupes.size}`);
console.log(`  → matchés sur une ligne historique : ${matched}`);
console.log(`  → sans ancien correspondant : ${sansAncien}`);
console.log(`  → ancien trouvé mais sans ligne historique (saison) : ${sansHistorique}`);
console.log(`  → groupes ambigus (≥2 anciens même clé, 1er retenu) : ${ambigus}`);
if (exemplesNonMatch.length) console.log(`  exemples non matchés : ${exemplesNonMatch.join(" | ")}`);

console.log(`\n=== CA par saison (groupes matchés) ===`);
const attendu: Record<string, number> = { "2020-2021": 44900, "2021-2022": 81658, "2022-2023": 98476, "2023-2024": 97589, "2024-2025": 91427, "2025-2026": 87722 };
for (const s of [...caParSaison.keys()].sort()) {
  const ca = Math.round(caParSaison.get(s)!);
  const att = attendu[s];
  const ecart = att ? ca - att : 0;
  console.log(`  ${s} : ${ca}€` + (att ? `  (attendu ${att}€, écart ${ecart >= 0 ? "+" : ""}${ecart}€)` : ""));
}

if (!COMMIT) {
  console.log(`\n>>> DRY-RUN. Aucune écriture. ${updates.length} lignes seraient mises à jour.`);
  process.exit(0);
}

// ---- COMMIT ----
let done = 0;
for (const u of updates) {
  const { error } = await supabase
    .from("historique_saisons")
    .update({ montant: u.montant, mode_reglement: u.mode, date_validation: u.date })
    .eq("id", u.id);
  if (error) console.error("MAJ:", u.id, error.message);
  else done++;
}
console.log(`\n>>> COMMIT terminé : ${done} lignes historique enrichies.`);
