// [021] Décalage d'échéances : helpers PURS (date +N mois, éligibilité, validation
// serveur) + moteur decalerEcheances sur un faux Supabase en mémoire (concurrence
// cron, échec remis à venir, double-clic, dashboard). Exécuter :
//   npx tsx scripts/test-decalage-echeances.mts
import {
  decalerDateMois,
  echeanceDecalable,
  validerNouvellesDates,
  depasseFinSaison,
} from "../lib/decalage-echeances";
import { resteParAdherent } from "../lib/encaissement";

let ok = 0, ko = 0;
const check = (l: string, c: boolean, g?: unknown) => {
  if (c) { ok++; console.log(`  ✓ ${l}`); }
  else { ko++; console.log(`  ✗ ${l}` + (g !== undefined ? `  → ${JSON.stringify(g)}` : "")); }
};

console.log("\n== decalerDateMois : même jour, repli dernier jour du mois ==");
check("31/01/2027 +1 = 28/02/2027 (février non bissextile)", decalerDateMois("2027-01-31", 1) === "2027-02-28");
check("31/01/2028 +1 = 29/02/2028 (bissextile)", decalerDateMois("2028-01-31", 1) === "2028-02-29");
check("15/11/2026 +1 = 15/12/2026 (même jour)", decalerDateMois("2026-11-15", 1) === "2026-12-15");
check("15/12/2026 +1 = 15/01/2027 (passage d'année)", decalerDateMois("2026-12-15", 1) === "2027-01-15");
check("30/11/2026 +3 = 28/02/2027 (repli)", decalerDateMois("2026-11-30", 3) === "2027-02-28");

console.log("\n== echeanceDecalable : seules les NON encaissées ==");
const E = (statut: string, pi: string | null = null, numero: number | null = 2) => echeanceDecalable({ statut, stripe_payment_intent_id: pi, numero_echeance: numero });
check("en_attente sans PI → décalable", E("en_attente") === true);
check("en_attente AVEC PI (en vol) → NON", E("en_attente", "pi_x") === false);
check("en_cours (claim cron) → NON", E("en_cours") === false);
check("echec → décalable", E("echec", "pi_failed") === true);
check("paye → NON", E("paye") === false);
check("rembourse → NON", E("rembourse") === false);
check("numero null (espèces) → NON", E("en_attente", null, null) === false);

console.log("\n== validerNouvellesDates : >= demain, ordre conservé ==");
const DEMAIN = "2026-11-13";
check("date du jour (demain-1) refusée", validerNouvellesDates([{ numero: 2, iso: "2026-11-12" }], DEMAIN).ok === false);
check("date passée refusée", validerNouvellesDates([{ numero: 2, iso: "2020-01-01" }], DEMAIN).ok === false);
check("demain exact accepté (bord)", validerNouvellesDates([{ numero: 2, iso: DEMAIN }], DEMAIN).ok === true);
check("ordre inversé (n°3 avant n°2) refusé", validerNouvellesDates([{ numero: 2, iso: "2027-02-01" }, { numero: 3, iso: "2027-01-01" }], DEMAIN).ok === false);
check("ordre conservé accepté", validerNouvellesDates([{ numero: 2, iso: "2027-01-01" }, { numero: 3, iso: "2027-02-01" }], DEMAIN).ok === true);

console.log("\n== depasseFinSaison : avertissement (31/08 de l'année de fin) ==");
check("saison 2026-27 : 01/09/2027 dépasse", depasseFinSaison("2027-09-01", "2026-11-01") === true);
check("saison 2026-27 : 15/07/2027 ne dépasse pas", depasseFinSaison("2027-07-15", "2026-11-01") === false);

// ---- Faux Supabase en mémoire (sous-ensemble utilisé par decalerEcheances +
//      recalculerEtatPaiement + nettoyerStatutEchec). ----
type Row = Record<string, unknown>;
type Filtre = { k: string; op: "eq" | "in" | "notnull"; v: unknown };
function fakeDb(tables: Record<string, Row[]>) {
  const keep = (rows: Row[], f: Filtre[]) =>
    rows.filter((r) =>
      f.every((x) =>
        x.op === "in" ? (x.v as unknown[]).includes(r[x.k])
        : x.op === "notnull" ? r[x.k] != null
        : r[x.k] === x.v,
      ),
    );
  return {
    _t: tables,
    from(table: string) {
      const rows = tables[table] ?? (tables[table] = []);
      const builder = (f: Filtre[], countMode = false) => {
        const api = {
          eq(k: string, v: unknown) { f.push({ k, op: "eq", v }); return api; },
          is(k: string, v: unknown) { f.push({ k, op: "eq", v }); return api; },
          in(k: string, v: unknown) { f.push({ k, op: "in", v }); return api; },
          not(k: string, _op: string, _v: unknown) { f.push({ k, op: "notnull", v: null }); return api; },
          order() { return api; },
          single: async () => { const m = keep(rows, f); return { data: m[0] ?? null, error: m[0] ? null : { message: "no rows" } }; },
          maybeSingle: async () => ({ data: keep(rows, f)[0] ?? null, error: null }),
          then: (res: (v: unknown) => unknown) => {
            const m = keep(rows, f);
            return Promise.resolve(countMode ? { count: m.length, error: null } : { data: m, error: null }).then(res);
          },
        };
        return api;
      };
      return {
        select(_c?: string, opts?: { count?: string; head?: boolean }) { return builder([], !!opts?.count); },
        insert(obj: Row) {
          const dup = obj.id != null && rows.some((r) => r.id === obj.id);
          if (!dup) rows.push({ ...obj });
          const result = dup
            ? { data: null, error: { message: "duplicate key value violates unique constraint", code: "23505" } }
            : { data: { ...obj }, error: null };
          return {
            select() { return { single: async () => result, maybeSingle: async () => result }; },
            then: (res: (v: unknown) => unknown) => Promise.resolve(result).then(res),
          };
        },
        update(obj: Row) {
          const f: Filtre[] = [];
          const applyAndReturn = () => { const m = keep(rows, f); m.forEach((r) => Object.assign(r, obj)); return m; };
          const chain = {
            eq(k: string, v: unknown) { f.push({ k, op: "eq", v }); return chain; },
            is(k: string, v: unknown) { f.push({ k, op: "eq", v }); return chain; },
            select() {
              return {
                single: async () => { const m = applyAndReturn(); return { data: m[0] ?? null, error: null }; },
                maybeSingle: async () => { const m = applyAndReturn(); return { data: m[0] ?? null, error: null }; },
              };
            },
            then: (res: (v: unknown) => unknown) => { applyAndReturn(); return Promise.resolve({ data: null, error: null }).then(res); },
          };
          return chain;
        },
      };
    },
  };
}

const { decalerEcheances } = await import("../lib/payments");
type SB = Parameters<typeof decalerEcheances>[0];
type ST = Parameters<typeof decalerEcheances>[2];
// Faux Stripe injectable : statut de retrieve + comportement de cancel, avec
// compteur d'appels pour vérifier qu'on annule bien avant de détacher.
function fakeStripe(opts: { retrieveStatus?: string; retrieveThrows?: boolean; cancelStatus?: string; cancelThrows?: boolean }) {
  const calls = { retrieve: 0, cancel: 0 };
  const stripe = {
    paymentIntents: {
      retrieve: async (id: string) => { calls.retrieve++; if (opts.retrieveThrows) throw new Error("stripe down"); return { id, status: opts.retrieveStatus ?? "requires_payment_method" }; },
      cancel: async (id: string) => { calls.cancel++; if (opts.cancelThrows) throw new Error("cancel failed"); return { id, status: opts.cancelStatus ?? "canceled" }; },
    },
  };
  return { stripe: stripe as unknown as ST, calls };
}
const adhBase = () => ({ id: "D", prenom: "Léa", nom: "T", email: "lea@test.fr", date_naissance: "2000-01-01", annule_at: null, engage_at: "2026-09-01", nb_echeances: 3, echeances_payees: 1, statut_paiement: "en_attente", mode_paiement: "stripe_3x", montant_total: 300, stripe_customer_id: "cus_x", supplement_statut: null });
const ech = (o: Partial<Row> & { id: string }): Row => ({ adherent_id: "D", montant: 100, statut: "en_attente", numero_echeance: null, date_prevue: null, stripe_payment_intent_id: null, echec_a: null, rappel_echec_envoye: false, mail_echec_envoye: false, mail_echec_admin_envoye: false, ...o });

console.log("\n== Tout décaler de 1 mois : seules les non encaissées bougent ==");
{
  const db = fakeDb({
    adherents: [adhBase()],
    changements_formule: [],
    paiements: [
      ech({ id: "p1", numero_echeance: 1, statut: "paye", date_prevue: "2026-10-01", stripe_payment_intent_id: "pi_1", date_paiement: "2026-10-01" }),
      ech({ id: "p2", numero_echeance: 2, statut: "en_attente", date_prevue: "2026-11-01" }),
      ech({ id: "p3", numero_echeance: 3, statut: "en_attente", date_prevue: "2026-12-01" }),
    ],
  });
  const r = await decalerEcheances(db as unknown as SB, { adherentId: "D", actionId: "A1", motif: "coup dur", mode: "tout", mois: 1, demainISO: "2026-11-13" });
  check("résultat ok", r.ok === true);
  check("2 échéances décalées", r.ok && r.deplacees === 2, r);
  const P = (id: string) => db._t.paiements.find((x) => x.id === id)!;
  check("p1 (payée) inchangée", P("p1").date_prevue === "2026-10-01" && P("p1").statut === "paye");
  check("p2 +1 mois (même jour) → 2026-12-01", P("p2").date_prevue === "2026-12-01", P("p2").date_prevue);
  check("p3 +1 mois → 2027-01-01", P("p3").date_prevue === "2027-01-01", P("p3").date_prevue);
  // Dashboard « encaissement à venir » : prochaine échéance recalculée + reste cohérent.
  check("prochaine_echeance recalculée = plus proche nouvelle date", db._t.adherents[0].prochaine_echeance === "2026-12-01", db._t.adherents[0].prochaine_echeance);
  const reste = resteParAdherent(db._t.paiements.map((p) => ({ adherent_id: p.adherent_id as string, montant: p.montant as number, statut: p.statut as string, numero_echeance: p.numero_echeance as number | null })));
  check("reste à encaisser = 200 € (p2+p3)", reste.get("D") === 200, reste.get("D"));
}

console.log("\n== Échec décalé : PI requires_action ANNULÉ chez Stripe puis décalé ==");
{
  const db = fakeDb({
    adherents: [{ ...adhBase(), statut_paiement: "echec_paiement" }],
    changements_formule: [],
    paiements: [
      ech({ id: "p1", numero_echeance: 1, statut: "paye", date_prevue: "2026-10-01", stripe_payment_intent_id: "pi_1" }),
      ech({ id: "p2", numero_echeance: 2, statut: "echec", date_prevue: "2026-11-01", stripe_payment_intent_id: "pi_3ds", echec_a: "2026-11-02T00:00:00Z", rappel_echec_envoye: true, mail_echec_envoye: true }),
    ],
  });
  const { stripe, calls } = fakeStripe({ retrieveStatus: "requires_action", cancelStatus: "canceled" });
  const r = await decalerEcheances(db as unknown as SB, { adherentId: "D", actionId: "A2", motif: "report", mode: "dates", dates: { p2: "2027-01-15" }, demainISO: "2026-11-13" }, stripe);
  const p2 = db._t.paiements.find((x) => x.id === "p2")!;
  check("PI lu puis ANNULÉ chez Stripe avant détachement", calls.retrieve === 1 && calls.cancel === 1);
  check("échec → en_attente (à venir)", p2.statut === "en_attente", p2.statut);
  check("nouvelle date appliquée", p2.date_prevue === "2027-01-15");
  check("PaymentIntent effacé (clé d'idempotence neuve)", p2.stripe_payment_intent_id === null);
  check("relances d'impayé arrêtées", p2.echec_a === null && p2.rappel_echec_envoye === false && p2.mail_echec_envoye === false);
  check("décalée (deplacees=1, aVerifier=0)", r.ok && r.deplacees === 1 && r.aVerifier === 0, r);
  check("ancien PID conservé dans le journal (avant)", (db._t.decalages_echeances[0].avant as { numero: number; pid?: string }[]).some((a) => a.pid === "pi_3ds"));
}

console.log("\n== Échec décalé : PI succeeded → REFUSÉ, passé « à vérifier » ==");
{
  const db = fakeDb({
    adherents: [{ ...adhBase(), statut_paiement: "echec_paiement", paiement_a_verifier: false }],
    changements_formule: [],
    paiements: [ech({ id: "p2", numero_echeance: 2, statut: "echec", date_prevue: "2026-11-01", stripe_payment_intent_id: "pi_ok" })],
  });
  const { stripe, calls } = fakeStripe({ retrieveStatus: "succeeded" });
  const r = await decalerEcheances(db as unknown as SB, { adherentId: "D", actionId: "A2b", motif: "report", mode: "dates", dates: { p2: "2027-01-15" }, demainISO: "2026-11-13" }, stripe);
  const p2 = db._t.paiements.find((x) => x.id === "p2")!;
  check("PI succeeded → jamais annulé", calls.cancel === 0);
  check("échéance NON décalée (date + PI conservés)", p2.date_prevue === "2026-11-01" && p2.statut === "echec" && p2.stripe_payment_intent_id === "pi_ok");
  check("dossier passé « à vérifier »", db._t.adherents[0].paiement_a_verifier === true);
  check("compté en aVerifier, pas en déplacé", r.ok && r.aVerifier === 1 && r.deplacees === 0, r);
}

console.log("\n== Échec décalé : appel Stripe en échec → AUCUN décalage (fail-closed) ==");
{
  const db = fakeDb({
    adherents: [{ ...adhBase(), statut_paiement: "echec_paiement" }],
    changements_formule: [],
    paiements: [ech({ id: "p2", numero_echeance: 2, statut: "echec", date_prevue: "2026-11-01", stripe_payment_intent_id: "pi_err" })],
  });
  const { stripe } = fakeStripe({ retrieveThrows: true });
  const r = await decalerEcheances(db as unknown as SB, { adherentId: "D", actionId: "A2c", motif: "report", mode: "dates", dates: { p2: "2027-01-15" }, demainISO: "2026-11-13" }, stripe);
  const p2 = db._t.paiements.find((x) => x.id === "p2")!;
  check("échéance NON décalée (Stripe KO)", p2.date_prevue === "2026-11-01" && p2.statut === "echec" && p2.stripe_payment_intent_id === "pi_err");
  check("refusée (refusees=1, deplacees=0)", r.ok && r.refusees === 1 && r.deplacees === 0, r);
}

console.log("\n== Échec décalé : cancel ne renvoie pas 'canceled' → AUCUN décalage ==");
{
  const db = fakeDb({
    adherents: [{ ...adhBase(), statut_paiement: "echec_paiement" }],
    changements_formule: [],
    paiements: [ech({ id: "p2", numero_echeance: 2, statut: "echec", date_prevue: "2026-11-01", stripe_payment_intent_id: "pi_x" })],
  });
  const { stripe } = fakeStripe({ retrieveStatus: "requires_action", cancelStatus: "requires_action" });
  const r = await decalerEcheances(db as unknown as SB, { adherentId: "D", actionId: "A2d", motif: "report", mode: "dates", dates: { p2: "2027-01-15" }, demainISO: "2026-11-13" }, stripe);
  const p2 = db._t.paiements.find((x) => x.id === "p2")!;
  check("échéance NON décalée (annulation non confirmée)", p2.date_prevue === "2026-11-01" && p2.statut === "echec");
  check("refusée", r.ok && r.refusees === 1 && r.deplacees === 0, r);
}

console.log("\n== Date du jour/passée refusée par le serveur ; ordre respecté ==");
{
  const mk = () => fakeDb({ adherents: [adhBase()], changements_formule: [], paiements: [
    ech({ id: "p2", numero_echeance: 2, statut: "en_attente", date_prevue: "2026-11-01" }),
    ech({ id: "p3", numero_echeance: 3, statut: "en_attente", date_prevue: "2026-12-01" }),
  ] });
  const dbPasse = mk();
  const rPasse = await decalerEcheances(dbPasse as unknown as SB, { adherentId: "D", actionId: "A3", motif: "x", mode: "dates", dates: { p2: "2026-11-13", p3: "2026-11-12" }, demainISO: "2026-11-13" });
  check("date du jour (demain-1) refusée → ok:false", rPasse.ok === false && (rPasse as { status: number }).status === 400);
  check("aucune ligne modifiée après refus", dbPasse._t.paiements.every((p) => p.date_prevue === (p.id === "p2" ? "2026-11-01" : "2026-12-01")));
  const dbOrdre = mk();
  const rOrdre = await decalerEcheances(dbOrdre as unknown as SB, { adherentId: "D", actionId: "A4", motif: "x", mode: "dates", dates: { p2: "2027-03-01", p3: "2027-02-01" }, demainISO: "2026-11-13" });
  check("ordre inversé refusé", rOrdre.ok === false);
}

console.log("\n== Croisement cron : une échéance en cours de prélèvement n'est jamais déplacée ==");
{
  const db = fakeDb({ adherents: [adhBase()], changements_formule: [], paiements: [
    ech({ id: "p2", numero_echeance: 2, statut: "en_cours", date_prevue: "2026-11-01" }), // claim cron
    ech({ id: "p3", numero_echeance: 3, statut: "en_attente", date_prevue: "2026-12-01" }),
  ] });
  const r = await decalerEcheances(db as unknown as SB, { adherentId: "D", actionId: "A5", motif: "x", mode: "tout", mois: 1, demainISO: "2026-11-13" });
  const P = (id: string) => db._t.paiements.find((x) => x.id === id)!;
  check("p2 en_cours NON déplacée (ancienne date conservée)", P("p2").date_prevue === "2026-11-01" && P("p2").statut === "en_cours");
  check("p3 déplacée", r.ok && r.deplacees === 1 && P("p3").date_prevue === "2027-01-01", r);
}

console.log("\n== Double-clic : même actionId → un seul décalage ==");
{
  const db = fakeDb({ adherents: [adhBase()], changements_formule: [], paiements: [
    ech({ id: "p3", numero_echeance: 3, statut: "en_attente", date_prevue: "2026-12-01" }),
  ] });
  const args = { adherentId: "D", actionId: "SAME", motif: "x", mode: "tout" as const, mois: 1, demainISO: "2026-11-13" };
  const r1 = await decalerEcheances(db as unknown as SB, args);
  const dateApres1 = db._t.paiements.find((x) => x.id === "p3")!.date_prevue;
  const r2 = await decalerEcheances(db as unknown as SB, args);
  check("1er appel déplace", r1.ok && r1.deplacees === 1);
  check("2e appel (même actionId) → dejaTraite, pas de 2e décalage", r2.ok && (r2 as { dejaTraite?: boolean }).dejaTraite === true, r2);
  check("date inchangée entre les deux appels (pas de double décalage)", db._t.paiements.find((x) => x.id === "p3")!.date_prevue === dateApres1);
  check("un seul enregistrement dans le journal", db._t.decalages_echeances.length === 1);
}

console.log("\n== Dossier annulé : refus ==");
{
  const db = fakeDb({ adherents: [{ ...adhBase(), annule_at: "2026-10-01" }], changements_formule: [], paiements: [ech({ id: "p2", numero_echeance: 2, statut: "en_attente", date_prevue: "2026-11-01" })] });
  const r = await decalerEcheances(db as unknown as SB, { adherentId: "D", actionId: "A6", motif: "x", mode: "tout", mois: 1, demainISO: "2026-11-13" });
  check("dossier annulé → refus 409", r.ok === false && (r as { status: number }).status === 409);
}

console.log(`\nRésultat : ${ok} OK / ${ko} KO`);
process.exit(ko === 0 ? 0 : 1);
