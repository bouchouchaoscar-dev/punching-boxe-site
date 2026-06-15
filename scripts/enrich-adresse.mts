// Enrichit anciens_adherents.adresse depuis data/anciens_adherents_enrichi.csv,
// SANS créer de personne : met seulement à jour l'existant. Adresse retenue =
// celle de la saison la plus RÉCENTE de la personne (les gens déménagent).
//   DRY-RUN : npx tsx scripts/enrich-adresse.mts
//   COMMIT  : npx tsx scripts/enrich-adresse.mts --commit
import { readFileSync, existsSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";
import { matchKey, sansAccents } from "../lib/anciennete";

const FICHIER = "data/anciens_adherents_enrichi.csv";
const COMMIT = process.argv.includes("--commit");
if (!existsSync(FICHIER)) { console.error(`Fichier introuvable : ${FICHIER}`); process.exit(1); }
for (const line of readFileSync(".env.local", "utf8").split("\n")) {
  const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
}
const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

function parseLigne(line: string): string[] {
  const out: string[] = []; let cur = ""; let inQ = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (c === '"') { if (inQ && line[i + 1] === '"') { cur += '"'; i++; } else inQ = !inQ; }
    else if (c === "," && !inQ) { out.push(cur); cur = ""; } else cur += c;
  }
  out.push(cur); return out.map((s) => s.trim());
}
const fallbackKey = (nom: string, prenom: string) => `NN|${sansAccents(nom)}|${sansAccents(prenom)}`;

const lignes = readFileSync(FICHIER, "utf8").split(/\r?\n/).filter((l) => l.trim());
const header = parseLigne(lignes[0]).map((h) => h.toLowerCase());
const col = (...n: string[]) => header.findIndex((h) => n.some((x) => h.includes(x)));
const idx = { saison: col("saison"), nom: col("nom"), prenom: col("prenom", "prénom"), naissance: col("naiss"), adresse: col("adresse") };

type G = { key: string; fb: string; nom: string; prenom: string; saison: string; adresse: string };
const groupes = new Map<string, G>(); // 1 par personne, adresse de la saison la + récente
let lignesData = 0, parasites = 0, sansAdresse = 0;
for (let i = 1; i < lignes.length; i++) {
  const f = parseLigne(lignes[i]);
  const saison = f[idx.saison]?.trim(); const nom = (f[idx.nom] ?? "").trim(); const prenom = (f[idx.prenom] ?? "").trim();
  if (nom.toUpperCase() === "NOMS" || prenom.toUpperCase() === "PRENOMS") { parasites++; continue; }
  if (!saison || !nom) continue;
  lignesData++;
  const adresse = (f[idx.adresse] ?? "").trim();
  if (!adresse) sansAdresse++;
  const mk = matchKey(nom, prenom, f[idx.naissance]);
  const keyId = mk ?? fallbackKey(nom, prenom);
  const prev = groupes.get(keyId);
  if (!prev || saison > prev.saison) groupes.set(keyId, { key: mk ?? "", fb: keyId, nom, prenom, saison, adresse: adresse || prev?.adresse || "" });
}

async function pg(t: string, c: string) { let a: any[] = [], from = 0; for (;;) { const { data } = await supabase.from(t).select(c).range(from, from + 999); if (!data || !data.length) break; a = a.concat(data); if (data.length < 1000) break; from += 1000; } return a; }
const anc = await pg("anciens_adherents", "id,nom,prenom,match_key");
const parMk = new Map<string, string[]>(); const parNp = new Map<string, string[]>();
for (const a of anc) {
  if (a.match_key) { const l = parMk.get(a.match_key) ?? []; l.push(a.id); parMk.set(a.match_key, l); }
  const fk = fallbackKey(a.nom ?? "", a.prenom ?? ""); const l = parNp.get(fk) ?? []; l.push(a.id); parNp.set(fk, l);
}

const updates: { id: string; adresse: string }[] = [];
let matched = 0, sansAncien = 0, ambigus = 0, sansAdr = 0;
const exNon: string[] = [];
for (const g of groupes.values()) {
  let ids = g.key ? parMk.get(g.key) ?? [] : [];
  if (!ids.length) ids = parNp.get(g.fb) ?? [];
  if (!ids.length) { sansAncien++; if (exNon.length < 10) exNon.push(`${g.nom} ${g.prenom}`); continue; }
  if (ids.length > 1) ambigus++;
  if (!g.adresse) { sansAdr++; continue; }
  matched++; updates.push({ id: ids[0], adresse: g.adresse });
}

console.log(`\n=== ENRICHISSEMENT ADRESSE — ${COMMIT ? "COMMIT" : "DRY-RUN"} ===`);
console.log(`Lignes données : ${lignesData} | parasites : ${parasites} | lignes sans adresse : ${sansAdresse}`);
console.log(`Personnes (uniques) : ${groupes.size}`);
console.log(`  → matchées avec adresse à écrire : ${matched}`);
console.log(`  → sans ancien correspondant : ${sansAncien}`);
console.log(`  → matchées mais sans adresse : ${sansAdr}`);
console.log(`  → ambigus (≥2 anciens même clé, 1er retenu) : ${ambigus}`);
if (exNon.length) console.log(`  exemples non matchés : ${exNon.join(" | ")}`);
console.log(`\nExemples d'adresses (5) :`);
for (const u of updates.slice(0, 5)) { const a = anc.find((x) => x.id === u.id); console.log(`  ${a?.nom} ${a?.prenom} → ${u.adresse}`); }

if (!COMMIT) { console.log(`\n>>> DRY-RUN. ${updates.length} adresses seraient écrites. Aucune écriture.`); process.exit(0); }
let done = 0;
for (const u of updates) { const { error } = await supabase.from("anciens_adherents").update({ adresse: u.adresse }).eq("id", u.id); if (error) console.error("MAJ:", u.id, error.message); else done++; }
console.log(`\n>>> COMMIT terminé : ${done} adresses écrites.`);
