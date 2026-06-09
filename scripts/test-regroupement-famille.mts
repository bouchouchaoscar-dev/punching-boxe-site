// Test de la logique de sourcing des campagnes (chantier familles).
// Lancer : npx --yes tsx scripts/test-regroupement-famille.mts
//
// Vérifie les scénarios validés avec le client :
//  1. Famille (3 personnes, 1 email) → 1 envoi, {{prenom}} = "Oscar, Léon et Marie".
//  2. Vrai doublon (même personne 2 fois) → fusionné une seule fois.
//  3. Variables individuelles (montant/formule) vidées si email multi-personnes,
//     normales si 1 seule personne.
//  4. Décompte "personnes touchées via emails" cohérent.
//  5. Désinscription au niveau email → tout le groupe exclu.

import {
  joindrePrenoms,
  regrouperParEmail,
  type PersonneEnvoi,
} from "../lib/campagnes";

let echecs = 0;
function check(nom: string, cond: boolean, detail?: unknown) {
  if (cond) console.log(`  ✓ ${nom}`);
  else {
    echecs++;
    console.log(`  ✗ ${nom}`, detail ?? "");
  }
}

// Reproduit l'ÉTAGE 1 (dédoublonnage par identité) tel que la route le fait.
function dedupParPersonne(brut: PersonneEnvoi[]) {
  const map = new Map<string, PersonneEnvoi>();
  let totalAvant = 0;
  for (const p of brut) {
    totalAvant++;
    if (!map.has(p.personKey)) map.set(p.personKey, p);
  }
  return { personnes: [...map.values()], doublons: totalAvant - map.size };
}

console.log("1) joindrePrenoms");
check('1 → "Oscar"', joindrePrenoms(["Oscar"]) === "Oscar");
check('2 → "Oscar et Léon"', joindrePrenoms(["Oscar", "Léon"]) === "Oscar et Léon");
check(
  '3 → "Oscar, Léon et Marie"',
  joindrePrenoms(["Oscar", "Léon", "Marie"]) === "Oscar, Léon et Marie",
  joindrePrenoms(["Oscar", "Léon", "Marie"]),
);
check("prénoms identiques dédupliqués", joindrePrenoms(["Léa", "Léa"]) === "Léa");
check("vide → ''", joindrePrenoms([null, "", undefined]) === "");

console.log("\n2) Famille (3 dossiers, 1 email) + un dossier seul");
const brut: PersonneEnvoi[] = [
  { personKey: "natif:1", email: "parent@x.fr", prenom: "Oscar", nom: "Bouchoucha", formule: "Boxe Française", montant: 410, saison: "2026-2027" },
  { personKey: "natif:2", email: "Parent@X.fr", prenom: "Léon", nom: "Bouchoucha", formule: "Savate et Prépa", montant: 250, saison: "2026-2027" },
  { personKey: "natif:3", email: "parent@x.fr", prenom: "Marie", nom: "Bouchoucha", formule: "Boxe Française", montant: 250, saison: "2026-2027" },
  // Vrai doublon : Oscar capté une 2e fois (présent dans 2 listes).
  { personKey: "natif:1", email: "parent@x.fr", prenom: "Oscar", nom: "Bouchoucha", formule: "Boxe Française", montant: 410, saison: "2026-2027" },
  // Dossier seul sur son email.
  { personKey: "natif:9", email: "solo@y.fr", prenom: "Sophie", nom: "Martin", formule: "Boxe Française", montant: 430, saison: "2026-2027" },
];

const { personnes, doublons } = dedupParPersonne(brut);
check("vrai doublon fusionné (4 natifs distincts)", personnes.length === 4, personnes.length);
check("1 doublon compté", doublons === 1, doublons);

const { envois, personnesExclues } = regrouperParEmail(personnes, new Set(), "2026-2027");

check("2 emails (1 famille + 1 solo)", envois.length === 2, envois.map((e) => e.email));

const famille = envois.find((e) => e.email === "parent@x.fr")!;
const solo = envois.find((e) => e.email === "solo@y.fr")!;

check("famille = 3 personnes sur 1 email", famille.personnes.length === 3, famille.personnes.length);
check(
  'famille {{prenom}} = "Oscar, Léon et Marie"',
  famille.vars.prenom === "Oscar, Léon et Marie",
  famille.vars.prenom,
);
check("famille {{nom}} = nom commun 'Bouchoucha'", famille.vars.nom === "Bouchoucha", famille.vars.nom);
check("famille {{montant}} VIDÉ (multi)", famille.vars.montant === "", famille.vars.montant);
check("famille {{formule}} VIDÉE (multi)", famille.vars.formule === "", famille.vars.formule);
check("famille {{saison}} conservée", famille.vars.saison === "2026-2027", famille.vars.saison);

check('solo {{prenom}} = "Sophie"', solo.vars.prenom === "Sophie", solo.vars.prenom);
check("solo {{montant}} normal (430)", solo.vars.montant === 430, solo.vars.montant);
check("solo {{formule}} normale", solo.vars.formule === "Boxe Française", solo.vars.formule);

const personnesCiblees = envois.reduce((s, e) => s + e.personnes.length, 0);
check("décompte : 4 personnes touchées via 2 emails", personnesCiblees === 4 && envois.length === 2, {
  personnesCiblees,
  emails: envois.length,
});

console.log("\n3) Désinscription au niveau email");
const r2 = regrouperParEmail(personnes, new Set(["parent@x.fr"]), "2026-2027");
check("famille entière exclue (3 personnes)", r2.personnesExclues === 3, r2.personnesExclues);
check("reste 1 envoi (solo)", r2.envois.length === 1 && r2.envois[0].email === "solo@y.fr");

void personnesExclues;

console.log(echecs === 0 ? "\n✅ Tous les tests passent." : `\n❌ ${echecs} test(s) en échec.`);
process.exit(echecs === 0 ? 0 : 1);
