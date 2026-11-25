// [022] Conversion essai→dossier : rattachement à la création (triplet), provenance
// reprise, plusieurs essais pour une personne + gardes statiques (cron filet sans
// limite 7 j, exclusion avant claim, coach sans donnée sensible, téléphone requis).
// Exécuter : npx tsx scripts/test-essais-conversion.mts
import { readFileSync } from "node:fs";

let ok = 0, ko = 0;
const check = (l: string, c: boolean, g?: unknown) => {
  if (c) { ok++; console.log(`  ✓ ${l}`); }
  else { ko++; console.log(`  ✗ ${l}` + (g !== undefined ? `  → ${JSON.stringify(g)}` : "")); }
};

// ---- Faux Supabase (sous-ensemble utilisé par rattacherEssaisAuDossier / apres) ----
type Row = Record<string, unknown>;
function fakeDb(tables: Record<string, Row[]>) {
  const match = (rows: Row[], f: [string, string, unknown][]) =>
    rows.filter((r) => f.every(([k, op, v]) => (op === "in" ? (v as unknown[]).includes(r[k]) : r[k] === v)));
  return {
    _t: tables,
    from(table: string) {
      const rows = tables[table] ?? (tables[table] = []);
      return {
        select() {
          const f: [string, string, unknown][] = [];
          const chain = {
            eq(k: string, v: unknown) { f.push([k, "eq", v]); return chain; },
            is(k: string, v: unknown) { f.push([k, "eq", v]); return chain; },
            then: (res: (v: unknown) => unknown) => Promise.resolve({ data: match(rows, f), error: null }).then(res),
          };
          return chain;
        },
        update(obj: Row) {
          const f: [string, string, unknown][] = [];
          const apply = () => match(rows, f).forEach((r) => Object.assign(r, obj));
          const chain = {
            eq(k: string, v: unknown) { f.push([k, "eq", v]); return chain; },
            in(k: string, v: unknown) { f.push([k, "in", v]); return chain; },
            then: (res: (v: unknown) => unknown) => { apply(); return Promise.resolve({ data: null, error: null }).then(res); },
          };
          return chain;
        },
      };
    },
  };
}

const { rattacherEssaisAuDossier, apresCreationDossier } = await import("../lib/presence-server");
type SB = Parameters<typeof rattacherEssaisAuDossier>[0];

console.log("\n== Rattachement à la création : plusieurs essais, même personne ==");
{
  const db = fakeDb({
    essais: [
      { id: "e1", nom: "DUPONT", prenom: "Jean", date_naissance: "2010-05-01", date_seance: "2026-01-10", provenance: null, provenance_autre: null, converti_dossier_id: null },
      { id: "e2", nom: "dupont", prenom: "jean", date_naissance: "2010-05-01", date_seance: "2026-01-17", provenance: "site_internet", provenance_autre: null, converti_dossier_id: null },
      { id: "e3", nom: "MARTIN", prenom: "Lea", date_naissance: "2012-03-03", date_seance: "2026-01-10", provenance: null, provenance_autre: null, converti_dossier_id: null },
    ],
    adherents: [{ id: "D", nom: "Dupont", prenom: "Jean", date_naissance: "2010-05-01", provenance: null, provenance_autre: null }],
  });
  const r = await rattacherEssaisAuDossier(db as unknown as SB, { id: "D", nom: "Dupont", prenom: "Jean", date_naissance: "2010-05-01" });
  check("2 essais de la personne rattachés (triplet, insensible casse)", r.count === 2, r);
  check("e1 converti → D", db._t.essais[0].converti_dossier_id === "D");
  check("e2 converti → D", db._t.essais[1].converti_dossier_id === "D");
  check("e3 (autre personne) NON rattaché", db._t.essais[2].converti_dossier_id === null);
  check("provenance reprise = essai le plus récent qui en a une", r.provenance === "site_internet", r);
}

console.log("\n== Provenance reprise à la création (si non saisie) ==");
{
  const db = fakeDb({
    essais: [{ id: "e1", nom: "DUPONT", prenom: "Jean", date_naissance: "2010-05-01", date_seance: "2026-01-10", provenance: "affiche_rue", provenance_autre: null, converti_dossier_id: null }],
    adherents: [{ id: "D", nom: "Dupont", prenom: "Jean", date_naissance: "2010-05-01", provenance: null, provenance_autre: null }],
  });
  await apresCreationDossier(db as unknown as SB, { id: "D", nom: "Dupont", prenom: "Jean", date_naissance: "2010-05-01" }, false);
  check("provenance du dossier reprise de l'essai", db._t.adherents[0].provenance === "affiche_rue", db._t.adherents[0]);
}
{
  const db = fakeDb({
    essais: [{ id: "e1", nom: "DUPONT", prenom: "Jean", date_naissance: "2010-05-01", date_seance: "2026-01-10", provenance: "affiche_rue", provenance_autre: null, converti_dossier_id: null }],
    adherents: [{ id: "D", nom: "Dupont", prenom: "Jean", date_naissance: "2010-05-01", provenance: "bouche_a_oreille", provenance_autre: null }],
  });
  await apresCreationDossier(db as unknown as SB, { id: "D", nom: "Dupont", prenom: "Jean", date_naissance: "2010-05-01" }, true);
  check("provenance saisie NON écrasée par l'essai", db._t.adherents[0].provenance === "bouche_a_oreille");
  check("essai tout de même rattaché", db._t.essais[0].converti_dossier_id === "D");
}

console.log("\n== Sans date de naissance : aucun rattachement (matchKey null) ==");
{
  const db = fakeDb({ essais: [{ id: "e1", nom: "X", prenom: "Y", date_naissance: "2010-05-01", date_seance: "2026-01-10", provenance: null, provenance_autre: null, converti_dossier_id: null }], adherents: [] });
  const r = await rattacherEssaisAuDossier(db as unknown as SB, { id: "D", nom: "X", prenom: "Y", date_naissance: null });
  check("DN absente → no-op", r.count === 0 && db._t.essais[0].converti_dossier_id === null);
}

console.log("\n== Gardes statiques (sources) ==");
const read = (p: string) => readFileSync(p, "utf8");
const cron = read("app/api/cron/presence/route.ts");
check("cron : filet de conversion SANS limite de délai (marquerSiConverti sur tous les non rattachés)", cron.includes("filet conversion") && cron.includes('.is("converti_dossier_id", null)'));
check("cron : ne lit plus essais.desinscrit (critère mort)", !cron.includes('.eq("desinscrit", false)'));
check("cron : exclusion testée AVANT le claim", cron.indexOf("exclusions.has(email)") < cron.indexOf("const reserves"));
const creation = read("lib/presence-server.ts");
check("conversion posée à la création du dossier (apresCreationDossier exporté)", creation.includes("export async function apresCreationDossier"));
const insc = read("app/api/adherents/route.ts");
const cpi = read("app/api/create-payment-intent/route.ts");
check("inscription espèces appelle apresCreationDossier", insc.includes("apresCreationDossier("));
check("inscription carte appelle apresCreationDossier", cpi.includes("apresCreationDossier("));
const coach = read("app/api/coach/presence/route.ts");
check("coach : essais sans téléphone/email/provenance (select minimal)", !coach.includes("telephone") && !/essais[\s\S]*provenance/.test(coach) && !/\.select\([^)]*email/.test(coach.slice(coach.indexOf("essais"))));
const routeEssai = read("app/api/presence/essai/route.ts");
check("route essai : téléphone OBLIGATOIRE + normalisé E.164", routeEssai.includes("normaliserTelephoneFr(body.telephone)") && routeEssai.includes("téléphone français invalide"));
const rattacher = read("app/api/admin/presence/rattacher/route.ts");
const rappeler = read("app/api/admin/presence/rappeler/route.ts");
check("route rattacher : admin fail-closed + converti_dossier_id (attach/detach)", rattacher.includes("isAdminRequest(request)") && rattacher.includes("converti_dossier_id"));
check("route rappeler : admin fail-closed + rappele_at/rappel_note", rappeler.includes("isAdminRequest(request)") && rappeler.includes("rappele_at") && rappeler.includes("rappel_note"));

console.log(`\nRésultat : ${ok} OK / ${ko} KO`);
process.exit(ko === 0 ? 0 : 1);
