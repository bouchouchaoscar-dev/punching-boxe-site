// Importeur des anciens adhérents (non-natifs) + historique saisons/disciplines.
//   DRY-RUN (défaut) : npx tsx scripts/import-anciens.mts
//   COMMIT           : npx tsx scripts/import-anciens.mts --commit
// Lit data/anciens_adherents_a_importer.csv (colonne saison + champs).
import { readFileSync, existsSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";

const FICHIER = process.argv[2]?.endsWith(".csv")
  ? process.argv[2]
  : "data/anciens_adherents_a_importer.csv";
const COMMIT = process.argv.includes("--commit");

if (!existsSync(FICHIER)) {
  console.error(`Fichier introuvable : ${FICHIER}`);
  process.exit(1);
}

// ---- Parseur CSV (gère les guillemets et les virgules internes) ----
function parseLigne(line: string): string[] {
  const out: string[] = [];
  let cur = "";
  let inQ = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (c === '"') {
      if (inQ && line[i + 1] === '"') {
        cur += '"';
        i++;
      } else inQ = !inQ;
    } else if (c === "," && !inQ) {
      out.push(cur);
      cur = "";
    } else cur += c;
  }
  out.push(cur);
  return out.map((s) => s.trim());
}

// ---- Normalisations ----
function sansAccents(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-zA-Z0-9 ]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}
function normaliserNom(s: string): string {
  // Retire les suffixes parasites type "GR" (grade) collés au nom.
  return s.replace(/\s+GR\b/gi, "").replace(/\s+/g, " ").trim();
}
function matchKey(nom: string, prenom: string, naissance: string | null): string | null {
  if (!naissance) return null;
  return `${sansAccents(normaliserNom(nom))}|${sansAccents(prenom)}|${naissance}`;
}
function clePersonne(nom: string, prenom: string, naissance: string | null): string {
  // Clé de dédup : avec naissance si dispo, sinon repli nom+prenom (flaggé).
  return matchKey(nom, prenom, naissance) ?? `SANS_NAISSANCE|${sansAccents(normaliserNom(nom))}|${sansAccents(prenom)}`;
}

// ---- Mapping disciplines ----
function mapDiscipline(raw: string): string {
  const d = raw.trim().toUpperCase();
  if (d === "BF" || d === "BFG" || d === "GRA") return "BF";
  if (d === "SF") return "SAVATE";
  if (d === "LES 2" || d === "LES2") return "LES_2";
  return "A_VERIFIER";
}

// ---- Date FR/ISO → AAAA-MM-JJ ----
function normaliserDate(raw: string): string | null {
  const s = raw.trim();
  if (!s) return null;
  let m = s.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (m) return s;
  m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (m) return `${m[3]}-${m[2].padStart(2, "0")}-${m[1].padStart(2, "0")}`;
  return null; // format inattendu → traité comme sans naissance
}

// ---- Lecture ----
const lignes = readFileSync(FICHIER, "utf8").split(/\r?\n/).filter((l) => l.trim());
const header = parseLigne(lignes[0]).map((h) => h.toLowerCase());
const col = (name: string) => header.findIndex((h) => h.includes(name));
const idx = {
  saison: col("saison"),
  nom: col("nom"),
  prenom: col("prenom") >= 0 ? col("prenom") : col("prénom"),
  naissance: col("naiss"),
  discipline: col("discipline"),
  adresse: col("adresse"),
  cp: col("code_postal") >= 0 ? col("code_postal") : col("cp"),
  ville: col("ville"),
  tel: col("tel") >= 0 ? col("tel") : col("telephone"),
  email: col("mail"),
};

type Personne = {
  nom: string;
  prenom: string;
  naissance: string | null;
  email: string | null;
  telephone: string | null;
  adresse: string | null;
  cp: string | null;
  ville: string | null;
  matchKey: string | null;
  aVerifier: boolean;
  saisons: Map<string, Set<string>>; // saison -> disciplines normalisées
};

const personnes = new Map<string, Personne>();
const disciplinesBrutes = new Map<string, number>();
const saisonsCount = new Map<string, number>();
// Contrôles qualité : âge implausible + naissances incohérentes (même nom/prénom, dates ≠).
const nomToNaissances = new Map<string, Set<string>>();
const implausibles: { nom: string; prenom: string; naissance: string; saison: string; age: number }[] = [];
let lignesData = 0;
let parasitesHeader = 0;
let sansEmail = 0;
let sansNaissance = 0;
let mojibake = 0;
const aVerifierDisc = new Map<string, number>();

for (let i = 1; i < lignes.length; i++) {
  const f = parseLigne(lignes[i]);
  const saison = f[idx.saison]?.trim();
  const nomRaw = (f[idx.nom] ?? "").trim();
  const prenomRaw = (f[idx.prenom] ?? "").trim();
  const discRaw = (f[idx.discipline] ?? "").trim();

  // Ligne d'en-tête ré-incrustée dans les données (NOMS,PRENOMS,Date Naiss,...).
  if (
    nomRaw.toUpperCase() === "NOMS" ||
    prenomRaw.toUpperCase() === "PRENOMS" ||
    discRaw.toLowerCase() === "discipline"
  ) {
    parasitesHeader++;
    continue;
  }
  if (!saison || !nomRaw) continue;
  lignesData++;

  disciplinesBrutes.set(discRaw || "(vide)", (disciplinesBrutes.get(discRaw || "(vide)") ?? 0) + 1);
  saisonsCount.set(saison, (saisonsCount.get(saison) ?? 0) + 1);

  const naissance = normaliserDate(f[idx.naissance] ?? "");
  const email = (f[idx.email] ?? "").trim().toLowerCase() || null;
  if (!email) sansEmail++;
  if (!naissance) sansNaissance++;
  if (/Ã/.test(nomRaw + prenomRaw)) mojibake++;

  // Qualité : naissances par personne (nom+prénom) + âge implausible à la saison.
  if (naissance) {
    const nameKey = `${sansAccents(normaliserNom(nomRaw))}|${sansAccents(prenomRaw)}`;
    if (!nomToNaissances.has(nameKey)) nomToNaissances.set(nameKey, new Set());
    nomToNaissances.get(nameKey)!.add(naissance);
    const anneeSaison = parseInt(saison.slice(0, 4), 10);
    const age = anneeSaison - parseInt(naissance.slice(0, 4), 10);
    if (age < 4 || age > 90)
      implausibles.push({ nom: normaliserNom(nomRaw), prenom: prenomRaw, naissance, saison, age });
  }

  const disc = mapDiscipline(discRaw);
  if (disc === "A_VERIFIER") {
    aVerifierDisc.set(discRaw || "(vide)", (aVerifierDisc.get(discRaw || "(vide)") ?? 0) + 1);
  }

  const cle = clePersonne(nomRaw, prenomRaw, naissance);
  let p = personnes.get(cle);
  if (!p) {
    p = {
      nom: normaliserNom(nomRaw),
      prenom: prenomRaw,
      naissance,
      email,
      telephone: (f[idx.tel] ?? "").trim() || null,
      adresse: (f[idx.adresse] ?? "").trim() || null,
      cp: (f[idx.cp] ?? "").trim() || null,
      ville: (f[idx.ville] ?? "").trim() || null,
      matchKey: matchKey(nomRaw, prenomRaw, naissance),
      aVerifier: !naissance || disc === "A_VERIFIER",
      saisons: new Map(),
    };
    personnes.set(cle, p);
  } else {
    // Complète l'email/coords si la 1re occurrence en manquait.
    if (!p.email && email) p.email = email;
    if (disc === "A_VERIFIER" || !naissance) p.aVerifier = true;
  }
  if (!p.saisons.has(saison)) p.saisons.set(saison, new Set());
  p.saisons.get(saison)!.add(disc);
}

// ---- Finalisation : flag a_verifier sur les cas qualité douteux ----
const incoherentes = [...nomToNaissances.entries()].filter(([, set]) => set.size > 1);
const nomsIncoherents = new Set(incoherentes.map(([k]) => k));
for (const p of personnes.values()) {
  const nameKey = `${sansAccents(p.nom)}|${sansAccents(p.prenom)}`;
  if (nomsIncoherents.has(nameKey)) p.aVerifier = true;
  if (p.naissance) {
    const maxSaison = [...p.saisons.keys()].sort().reverse()[0];
    const age = parseInt(maxSaison.slice(0, 4), 10) - parseInt(p.naissance.slice(0, 4), 10);
    if (age < 4 || age > 90) p.aVerifier = true;
  }
}

// ---- Rapport DRY-RUN ----
console.log(`\n=== IMPORT ANCIENS — ${COMMIT ? "COMMIT" : "DRY-RUN (aucune écriture)"} ===`);
console.log(`Fichier : ${FICHIER}`);
console.log(`Lignes de données : ${lignesData}  |  lignes d'en-tête parasites ignorées : ${parasitesHeader}`);

console.log(`\n--- Saisons (mapping = valeur telle quelle) ---`);
for (const [s, n] of [...saisonsCount.entries()].sort()) console.log(`  ${s} : ${n} lignes`);

console.log(`\n--- Disciplines BRUTES distinctes ---`);
for (const [d, n] of [...disciplinesBrutes.entries()].sort((a, b) => b[1] - a[1]))
  console.log(`  ${JSON.stringify(d)} → ${mapDiscipline(d)}  (${n})`);

console.log(`\n--- Parasites discipline → A_VERIFIER ---`);
if (aVerifierDisc.size === 0) console.log("  (aucun)");
for (const [d, n] of aVerifierDisc.entries()) console.log(`  ${JSON.stringify(d)} : ${n}`);

const personnesArr = [...personnes.values()];
const sansNaissPers = personnesArr.filter((p) => !p.naissance).length;
const aVerifierPers = personnesArr.filter((p) => p.aVerifier).length;
const sansEmailPers = personnesArr.filter((p) => !p.email).length;
const multiSaison = personnesArr.filter((p) => p.saisons.size > 1).length;

console.log(`\n--- Personnes (après dédup) ---`);
console.log(`  Personnes uniques        : ${personnesArr.length}`);
console.log(`  ... présentes >1 saison  : ${multiSaison}`);
console.log(`  ... sans email           : ${sansEmailPers}`);
console.log(`  ... sans naissance       : ${sansNaissPers}  (match_key NULL → jamais auto-matchées)`);
console.log(`  ... à vérifier (flag)    : ${aVerifierPers}`);
console.log(`\n--- Qualité données (lignes) ---`);
console.log(`  Lignes sans email        : ${sansEmail}`);
console.log(`  Lignes sans naissance    : ${sansNaissance}`);
console.log(`  Lignes avec mojibake (Ã) : ${mojibake}  ⚠️ encodage à corriger si élevé`);

if (sansNaissPers > 0) {
  console.log(`\n--- Personnes sans naissance (extrait) ---`);
  for (const p of personnesArr.filter((x) => !x.naissance).slice(0, 15))
    console.log(`  ${p.nom} ${p.prenom}  [${[...p.saisons.keys()].join(", ")}]`);
}

// Naissances incohérentes : même nom+prénom mais plusieurs dates (≈ date d'inscription saisie par erreur).
console.log(`\n--- Naissances INCOHÉRENTES (même nom/prénom, dates ≠) ---`);
console.log(`  ${incoherentes.length} cas (probables dates d'inscription au lieu de naissance)`);
for (const [k, set] of incoherentes.slice(0, 12)) {
  const [nom, prenom] = k.split("|");
  console.log(`  ${nom} ${prenom} : ${[...set].sort().join("  vs  ")}`);
}

console.log(`\n--- Naissances IMPLAUSIBLES (âge <4 ou >90 à la saison) ---`);
console.log(`  ${implausibles.length} lignes`);
for (const x of implausibles.slice(0, 12))
  console.log(`  ${x.nom} ${x.prenom}  né ${x.naissance}  → ${x.age} ans en ${x.saison}`);

if (!COMMIT) {
  console.log(`\n>>> DRY-RUN terminé. Aucune donnée écrite.`);
  console.log(`>>> Valide le mapping ci-dessus, puis relance avec --commit.`);
  process.exit(0);
}

// ---- COMMIT (écriture) ----
for (const k of ["NEXT_PUBLIC_SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY"]) {
  if (!process.env[k]) {
    for (const line of readFileSync(".env.local", "utf8").split("\n")) {
      const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
      if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
    }
    break;
  }
}
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

let okPers = 0,
  okHist = 0;
for (const p of personnesArr) {
  const { data, error } = await supabase
    .from("anciens_adherents")
    .insert({
      nom: p.nom,
      prenom: p.prenom,
      date_naissance: p.naissance,
      email: p.email,
      telephone: p.telephone,
      ville: p.ville,
      code_postal: p.cp,
      match_key: p.matchKey,
      a_verifier: p.aVerifier,
      source: "import_excel",
    })
    .select("id")
    .single();
  if (error || !data) {
    console.error("Insert ancien:", p.nom, p.prenom, error?.message);
    continue;
  }
  okPers++;
  const rows = [...p.saisons.entries()].map(([saison, set]) => ({
    ancien_id: data.id,
    saison,
    disciplines: [...set],
  }));
  const { error: e2 } = await supabase.from("historique_saisons").insert(rows);
  if (e2) console.error("Insert hist:", p.nom, e2.message);
  else okHist += rows.length;
}
console.log(`\n>>> COMMIT terminé : ${okPers} personnes, ${okHist} lignes d'historique.`);
