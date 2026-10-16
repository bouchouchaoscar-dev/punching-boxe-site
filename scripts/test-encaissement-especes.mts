// [020] Encaissement ESPÈCES en plusieurs fois (cotisation ET supplément).
// Moteur (encaisserEspeces / supprimerVersementEspeces / recalculerEtatPaiement)
// testé sur un faux Supabase en mémoire + helpers purs + statutTrombi.
// Exécuter : npx tsx scripts/test-encaissement-especes.mts
import { totalEncaisseEspeces, resteDuEspeces, versementValide, estVersementEspeces } from "../lib/encaissement";
import { statutTrombi } from "../lib/paiement";

let ok = 0, ko = 0;
const check = (l: string, c: boolean, g?: unknown) => {
  if (c) { ok++; console.log(`  ✓ ${l}`); }
  else { ko++; console.log(`  ✗ ${l}` + (g !== undefined ? `  → ${JSON.stringify(g)}` : "")); }
};

// ---- Faux Supabase en mémoire (sous-ensemble utilisé par le moteur) ----
type Row = Record<string, unknown>;
function fakeDb(tables: Record<string, Row[]>) {
  const match = (rows: Row[], f: [string, string, unknown][]) =>
    rows.filter((r) => f.every(([k, op, v]) => (op === "in" ? (v as unknown[]).includes(r[k]) : r[k] === v)));
  return {
    from(table: string) {
      const rows = tables[table] ?? (tables[table] = []);
      const q = (f: [string, string, unknown][]) => ({
        eq(k: string, v: unknown) { f.push([k, "eq", v]); return q(f); },
        is(k: string, v: unknown) { f.push([k, "eq", v]); return q(f); },
        in(k: string, v: unknown) { f.push([k, "in", v]); return q(f); },
        order() { return q(f); },
        single: async () => { const m = match(rows, f); return { data: m[0] ?? null, error: m[0] ? null : { message: "no rows" } }; },
        maybeSingle: async () => ({ data: match(rows, f)[0] ?? null, error: null }),
        then: (res: (v: unknown) => unknown) => Promise.resolve({ data: match(rows, f), error: null }).then(res),
      });
      return {
        select(_c?: string) { return q([]); },
        insert(obj: Row) {
          const dup = obj.id != null && rows.some((r) => r.id === obj.id);
          const row: Row = { id: obj.id ?? `row_${Math.random().toString(36).slice(2)}`, montant_rembourse: 0, ...obj };
          if (!dup) rows.push(row);
          const result = dup
            ? { data: null, error: { message: "duplicate key value violates unique constraint", code: "23505" } }
            : { data: row, error: null };
          return {
            select() { return { single: async () => result, maybeSingle: async () => result }; },
            then: (res: (v: unknown) => unknown) => Promise.resolve(result).then(res),
          };
        },
        update(obj: Row) {
          const f: [string, string, unknown][] = [];
          return {
            eq(k: string, v: unknown) {
              f.push([k, "eq", v]);
              const chain = {
                eq(k2: string, v2: unknown) { f.push([k2, "eq", v2]); return chain; },
                select() { return { single: async () => { const m = match(rows, f); m.forEach((r) => Object.assign(r, obj)); return { data: m[0] ?? null, error: null }; }, maybeSingle: async () => { const m = match(rows, f); m.forEach((r) => Object.assign(r, obj)); return { data: m[0] ?? null, error: null }; } }; },
                then: (res: (v: unknown) => unknown) => { match(rows, f).forEach((r) => Object.assign(r, obj)); return Promise.resolve({ data: null, error: null }).then(res); },
              };
              return chain;
            },
          };
        },
        delete() {
          const f: [string, string, unknown][] = [];
          return { eq(k: string, v: unknown) { f.push([k, "eq", v]); return { then: (res: (v: unknown) => unknown) => { for (const r of match(rows, f)) rows.splice(rows.indexOf(r), 1); return Promise.resolve({ data: null, error: null }).then(res); } }; } };
        },
      };
    },
    _t: tables,
  };
}

const { encaisserEspeces, supprimerVersementEspeces } = await import("../lib/payments");
type SB = Parameters<typeof encaisserEspeces>[0];
const dossierEspeces = (over: Row = {}): Row => ({
  id: "D", montant_total: 430, mode_paiement: "especes", statut_paiement: "en_attente",
  nb_echeances: 1, echeances_payees: 0, engage_at: null, annule_at: null, paiement_a_verifier: false,
  stripe_payment_intent_id: null, supplement_statut: null, prenom: "Léa", nom: "T", email: "", date_naissance: "2000-01-01", ...over,
});
const trombi = (a: Row) => statutTrombi(a as Parameters<typeof statutTrombi>[0]);

console.log("\n== Helpers purs ==");
check("resteDuEspeces(430, 250) = 180", resteDuEspeces(430, 250) === 180);
check("resteDuEspeces jamais négatif", resteDuEspeces(430, 500) === 0);
check("versementValide(180, 180) OK (= tout)", versementValide(180, 180));
check("versementValide(200, 180) refusé (> reste)", !versementValide(200, 180));
check("versementValide(0, 180) refusé", !versementValide(0, 180));
const vrows = [
  { montant: 250, statut: "paye", numero_echeance: null, stripe_payment_intent_id: null, changement_id: null },
  { montant: 100, statut: "paye", numero_echeance: null, stripe_payment_intent_id: null, changement_id: "C1" },
  { montant: 50, statut: "en_attente", numero_echeance: null, stripe_payment_intent_id: null, changement_id: null },
  { montant: 30, statut: "paye", numero_echeance: 1, stripe_payment_intent_id: null, changement_id: null },
];
check("totalEncaisseEspeces cotisation = 250 (exclut supplément/échéance/non payé)", totalEncaisseEspeces(vrows, { changementId: null }) === 250);
check("totalEncaisseEspeces supplément C1 = 100", totalEncaisseEspeces(vrows, { changementId: "C1" }) === 100);
check("estVersementEspeces : ligne carte (PI) exclue", !estVersementEspeces({ montant: 10, statut: "paye", numero_echeance: null, stripe_payment_intent_id: "pi_1" }));

console.log("\n== statutTrombi : espèces partiel reste ORANGE, soldé VERT ==");
check("espèces en attente (partiel) → orange", trombi(dossierEspeces({ statut_paiement: "en_attente" })).couleur === "orange");
check("espèces confirmées (soldé) → vert", trombi(dossierEspeces({ statut_paiement: "confirme_especes" })).couleur === "vert");

console.log("\n== Versement PARTIEL cotisation → orange, reste correct ==");
{
  const db = fakeDb({ adherents: [dossierEspeces()], paiements: [], changements_formule: [] });
  const r = await encaisserEspeces(db as unknown as SB, { adherentId: "D", versementId: "V1", montantEuros: 250 });
  check("versement accepté", r.ok);
  check("reste = 180", r.ok && r.cible.reste === 180, r);
  check("une ligne paiement créée (paye, numéro null)", db._t.paiements.length === 1 && db._t.paiements[0].statut === "paye" && db._t.paiements[0].numero_echeance === null);
  check("statut cotisation reste en_attente (orange)", db._t.adherents[0].statut_paiement === "en_attente");
  check("pas encore engagé", db._t.adherents[0].engage_at === null);
}

console.log("\n== Deux versements qui SOLDENT → vert (confirme_especes) ==");
{
  const db = fakeDb({ adherents: [dossierEspeces()], paiements: [], changements_formule: [] });
  await encaisserEspeces(db as unknown as SB, { adherentId: "D", versementId: "V1", montantEuros: 250 });
  const r2 = await encaisserEspeces(db as unknown as SB, { adherentId: "D", versementId: "V2", montantEuros: 180 });
  check("reste = 0 après 2e versement", r2.ok && r2.cible.reste === 0);
  check("statut → confirme_especes (vert)", db._t.adherents[0].statut_paiement === "confirme_especes");
  check("engage_at figé au solde", db._t.adherents[0].engage_at != null);
  check("2 lignes de versement", db._t.paiements.length === 2);
}

console.log("\n== Dépassement du reste dû REFUSÉ par le serveur ==");
{
  const db = fakeDb({ adherents: [dossierEspeces()], paiements: [], changements_formule: [] });
  await encaisserEspeces(db as unknown as SB, { adherentId: "D", versementId: "V1", montantEuros: 250 }); // reste 180
  const r = await encaisserEspeces(db as unknown as SB, { adherentId: "D", versementId: "V2", montantEuros: 200 });
  check("200 € > reste 180 € → refusé (400)", !r.ok && (r as { status: number }).status === 400);
  check("aucune 2e ligne créée", db._t.paiements.length === 1);
}

console.log("\n== Double envoi avec la MÊME clé → un seul versement ==");
{
  const db = fakeDb({ adherents: [dossierEspeces()], paiements: [], changements_formule: [] });
  const a1 = await encaisserEspeces(db as unknown as SB, { adherentId: "D", versementId: "SAME", montantEuros: 100 });
  const a2 = await encaisserEspeces(db as unknown as SB, { adherentId: "D", versementId: "SAME", montantEuros: 100 });
  check("1er envoi OK", a1.ok);
  check("2e envoi idempotent (dejaTraite)", a2.ok && (a2 as { dejaTraite?: boolean }).dejaTraite === true);
  check("une seule ligne créée", db._t.paiements.length === 1);
  check("reste = 330 (un seul versement de 100 compté)", a2.ok && a2.cible.reste === 330);
}

console.log("\n== Suppression d'un versement → reste & statut recalculés ==");
{
  const db = fakeDb({ adherents: [dossierEspeces()], paiements: [], changements_formule: [] });
  await encaisserEspeces(db as unknown as SB, { adherentId: "D", versementId: "V1", montantEuros: 250 });
  await encaisserEspeces(db as unknown as SB, { adherentId: "D", versementId: "V2", montantEuros: 180 }); // soldé
  check("soldé avant suppression", db._t.adherents[0].statut_paiement === "confirme_especes");
  const d = await supprimerVersementEspeces(db as unknown as SB, { adherentId: "D", versementId: "V2" });
  check("suppression OK, reste repasse à 180", d.ok && d.cible.reste === 180);
  check("statut repasse en_attente (orange)", db._t.adherents[0].statut_paiement === "en_attente");
  check("une seule ligne restante", db._t.paiements.length === 1);
  // Refus de supprimer une ligne carte (PI) / échéance.
  db._t.paiements.push({ id: "CARTE", adherent_id: "D", statut: "paye", numero_echeance: null, stripe_payment_intent_id: "pi_x", montant: 100 });
  const dc = await supprimerVersementEspeces(db as unknown as SB, { adherentId: "D", versementId: "CARTE" });
  check("suppression d'une ligne carte refusée (409)", !dc.ok && (dc as { status: number }).status === 409);
}

console.log("\n== « Tout encaisser » (un clic) — non-régression dossier simple ==");
{
  const db = fakeDb({ adherents: [dossierEspeces()], paiements: [], changements_formule: [] });
  const r = await encaisserEspeces(db as unknown as SB, { adherentId: "D", versementId: "V1", tout: true });
  check("tout → reste 0", r.ok && r.cible.reste === 0);
  check("une ligne = montant_total (430)", db._t.paiements.length === 1 && db._t.paiements[0].montant === 430);
  check("statut confirme_especes (vert)", db._t.adherents[0].statut_paiement === "confirme_especes");
}

console.log("\n== Supplément de changement de formule encaissé en DEUX fois ==");
{
  const db = fakeDb({
    adherents: [dossierEspeces({ statut_paiement: "confirme_especes", engage_at: "2026-09-01", option_prepa_physique: true, package: "boxe_classique", supplement_statut: "attente_especes" })],
    paiements: [],
    changements_formule: [{ id: "C1", dossier_id: "D", statut: "actif", mode_reglement: "especes", montant_cents: 15000, paiement_id: null, nouvelle_formule: "boxe_prepa", signature_requise: true }],
  });
  const r1 = await encaisserEspeces(db as unknown as SB, { adherentId: "D", versementId: "S1", montantEuros: 100, changementId: "C1" });
  check("1er versement supplément : reste 50", r1.ok && r1.cible.reste === 50);
  check("supplement_statut reste attente_especes (orange)", db._t.adherents[0].supplement_statut === "attente_especes");
  const r2 = await encaisserEspeces(db as unknown as SB, { adherentId: "D", versementId: "S2", montantEuros: 50, changementId: "C1" });
  check("2e versement : reste 0 (soldé)", r2.ok && r2.cible.reste === 0);
  check("supplement_statut effacé (null)", db._t.adherents[0].supplement_statut === null);
  check("dépassement supplément refusé", !(await encaisserEspeces(db as unknown as SB, { adherentId: "D", versementId: "S3", montantEuros: 10, changementId: "C1" })).ok);
}

console.log("\n== Non-régression : ancien dossier encaissé en UNE fois (ligne unique) ==");
{
  // Dossier historique : une seule ligne especes = montant_total, déjà confirmée.
  const db = fakeDb({
    adherents: [dossierEspeces({ statut_paiement: "confirme_especes", engage_at: "2026-09-01" })],
    paiements: [{ id: "OLD", adherent_id: "D", statut: "paye", montant: 430, numero_echeance: null, stripe_payment_intent_id: null, changement_id: null }],
    changements_formule: [],
  });
  const { recalculerEtatPaiement } = await import("../lib/payments");
  await recalculerEtatPaiement("D", db as unknown as SB);
  check("reste confirmé, statut inchangé (confirme_especes)", db._t.adherents[0].statut_paiement === "confirme_especes");
  check("ligne unique conservée", db._t.paiements.length === 1);
}

console.log(`\nRésultat : ${ok} OK / ${ko} KO`);
process.exit(ko === 0 ? 0 : 1);
