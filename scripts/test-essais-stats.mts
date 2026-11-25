// [023] Agrégats du suivi des essais : construireSuiviEssais (taux sur essais mûrs,
// médiane, une personne = un essai, attribution par prof, échantillon faible,
// provenance) + mediane + tri. Exécuter : npx tsx scripts/test-essais-stats.mts
import { construireSuiviEssais, mediane, trierPersonnes, type EssaiRow, type DossierRow, type Prof } from "../lib/essais-stats";
import type { PaiementPourStatut } from "../lib/statut-essai";

let ok = 0, ko = 0;
const check = (l: string, c: boolean, g?: unknown) => {
  if (c) { ok++; console.log(`  ✓ ${l}`); }
  else { ko++; console.log(`  ✗ ${l}` + (g !== undefined ? `  → ${JSON.stringify(g)}` : "")); }
};

const NOW = new Date("2026-02-01T12:00:00Z");
const e = (o: Partial<EssaiRow> & { id: string; prenom: string; nom: string; date_seance: string }): EssaiRow => ({
  date_naissance: "2000-01-01", email: null, telephone: null, provenance: null, provenance_autre: null,
  cours_id: "C1", rappele_at: null, converti_dossier_id: null, ...o,
});

console.log("\n== Agrégats : taux sur mûrs, en cours exclus, une personne = un essai ==");
{
  const essais: EssaiRow[] = [
    e({ id: "a1", prenom: "A", nom: "Un", date_seance: "2026-01-01", converti_dossier_id: "D1", cours_id: "C1", provenance: "site_internet" }),
    e({ id: "a2", prenom: "A", nom: "Un", date_seance: "2026-01-20", converti_dossier_id: "D1", cours_id: "C1" }), // 2e séance, même personne
    e({ id: "b1", prenom: "B", nom: "Deux", date_seance: "2026-01-02", converti_dossier_id: "D2", cours_id: "C1" }),
    e({ id: "c1", prenom: "C", nom: "Trois", date_seance: "2026-01-03", cours_id: "C2" }),
    e({ id: "d1", prenom: "D", nom: "Quatre", date_seance: "2026-01-28", cours_id: "C2" }), // < 14 j → en cours
    e({ id: "e1", prenom: "E", nom: "Cinq", date_seance: "2026-01-04", cours_id: "C1", rappele_at: "2026-01-25" }),
  ];
  const dossierById = new Map<string, DossierRow>([
    ["D1", { id: "D1", annule_at: null, statut_paiement: "en_attente", echeances_payees: 1 }],
    ["D2", { id: "D2", annule_at: null, statut_paiement: "en_attente", echeances_payees: 0 }],
  ]);
  const paiementsByDossier = new Map<string, PaiementPourStatut[]>([
    ["D1", [{ statut: "paye", date_paiement: "2026-01-10T00:00:00Z" }]], // inscrit, délai 9
    ["D2", []], // dossier en cours (rien encaissé)
  ]);
  const profs: Record<string, Prof[]> = {
    "C1|2025-12-29": [{ id: "alice", nom: "Alice" }], // lundi de la semaine du 01-01..04
    "C1|2026-01-19": [{ id: "alice", nom: "Alice" }], // 2e séance de A
    "C2|2025-12-29": [{ id: "alice", nom: "Alice" }, { id: "bob", nom: "Bob" }], // C : deux profs
    "C2|2026-01-26": [], // D : aucun prof
  };
  const s = construireSuiviEssais({
    essais, dossierById, paiementsByDossier,
    coursLabel: (id) => (id === "C1" ? "Boxe · 18:00" : "Savate · 19:00"),
    profsPourSeance: (coursId, dateISO) => profs[`${coursId}|${lundi(dateISO)}`] ?? [],
    nouveauxSansEssai: [],
    maintenant: NOW,
  });

  check("5 personnes (A venue 2× comptée une fois)", s.kpis.essais === 5, s.kpis);
  check("6 séances", s.kpis.seances === 6);
  check("1 inscrit (A)", s.kpis.inscrits === 1);
  check("4 essais mûrs (D exclu, < 14 j)", s.kpis.murs === 4, s.kpis);
  check("1 en cours (D)", s.kpis.enCours === 1);
  check("taux = 1/4 = 0,25 (sur mûrs)", s.kpis.taux === 0.25, s.kpis.taux);
  check("délai médian = 9 (A)", s.kpis.delaiMedian === 9, s.kpis.delaiMedian);
  check("1 à rappeler (C)", s.kpis.aRappeler === 1);
  // Cohérence : somme des statuts = nombre d'essais.
  const parStatut = s.personnes.reduce((m, p) => ((m[p.statut] = (m[p.statut] ?? 0) + 1), m), {} as Record<string, number>);
  const somme = Object.values(parStatut).reduce((a, b) => a + b, 0);
  check("somme des statuts = nb d'essais", somme === s.kpis.essais, parStatut);
  check("statuts attendus", parStatut.inscrit === 1 && parStatut.dossier_en_cours === 1 && parStatut.a_rappeler === 1 && parStatut.en_attente === 1 && parStatut.rappele === 1, parStatut);

  // Attribution par prof.
  const alice = s.parProf.find((x) => x.cle === "alice")!;
  const bob = s.parProf.find((x) => x.cle === "bob")!;
  const sansProf = s.parProf.find((x) => x.cle === "__aucun__")!;
  check("Alice : 4 essais (A,B,C,E)", alice.essais === 4, alice);
  check("Bob : 1 essai (C) — comptée aussi pour Bob (2 profs)", bob.essais === 1);
  check("Prof non renseigné : 1 (D)", sansProf.essais === 1 && sansProf.label === "Prof non renseigné");
  check("échantillon trop petit (Alice : 4 mûrs < 5)", alice.echantillonFaible === true);

  // Provenance.
  const prov = s.parProvenance.find((x) => x.label === "Site internet")!;
  const provNone = s.parProvenance.find((x) => x.cle === "__none__")!;
  check("provenance 'Site internet' : 1 (A)", prov.essais === 1);
  check("provenance 'Non renseigné' présente", provNone.essais === 4 && provNone.label === "Non renseigné", provNone);

  // Tri : à rappeler en tête.
  const tri = trierPersonnes(s.personnes);
  check("tri : À RAPPELER en tête", tri[0].statut === "a_rappeler");
}

console.log("\n== Seuil « échantillon trop petit » (>= 5 mûrs → fiable) ==");
{
  const mk = (n: number) => Array.from({ length: n }, (_, i) => e({ id: `x${i}`, prenom: `P${i}`, nom: `N${i}`, date_naissance: `20${10 + i}-01-01`, date_seance: "2026-01-01", cours_id: "C1" }));
  const base = { dossierById: new Map(), paiementsByDossier: new Map(), coursLabel: () => "Cours", profsPourSeance: () => [{ id: "alice", nom: "Alice" }], nouveauxSansEssai: [], maintenant: NOW };
  const s4 = construireSuiviEssais({ essais: mk(4), ...base });
  const s5 = construireSuiviEssais({ essais: mk(5), ...base });
  check("4 mûrs → échantillon faible", s4.parProf[0].echantillonFaible === true);
  check("5 mûrs → fiable", s5.parProf[0].echantillonFaible === false);
}

console.log("\n== Médiane (pair / impair) ==");
check("impair [9] = 9", mediane([9]) === 9);
check("impair [1,2,3,4,5] = 3", mediane([5, 1, 3, 2, 4]) === 3);
check("pair [4,8] = 6", mediane([8, 4]) === 6);
check("pair [1,2,3,4] = 2,5", mediane([4, 3, 2, 1]) === 2.5);
check("vide → null", mediane([]) === null);

console.log("\n== Provenance des nouveaux adhérents SANS essai ==");
{
  const s = construireSuiviEssais({
    essais: [], dossierById: new Map(), paiementsByDossier: new Map(),
    coursLabel: () => "Cours", profsPourSeance: () => [],
    nouveauxSansEssai: [
      { provenance: "site_internet", provenance_autre: null },
      { provenance: "site_internet", provenance_autre: null },
      { provenance: null, provenance_autre: null },
    ],
    maintenant: NOW,
  });
  const site = s.provenanceNouveaux.find((x) => x.label === "Site internet")!;
  check("nouveaux sans essai : Site internet = 2", site.nombre === 2, s.provenanceNouveaux);
  check("nouveaux sans essai : Non renseigné = 1", s.provenanceNouveaux.find((x) => x.code === "__none__")?.nombre === 1);
}

function lundi(dateISO: string): string {
  const [y, m, d] = dateISO.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  dt.setUTCDate(dt.getUTCDate() + (dt.getUTCDay() === 0 ? -6 : 1 - dt.getUTCDay()));
  return dt.toISOString().slice(0, 10);
}

console.log(`\nRésultat : ${ok} OK / ${ko} KO`);
process.exit(ko === 0 ? 0 : 1);
