// [BUG échec figé] Régularisation d'une échéance échouée : l'alerte d'échec doit
// s'effacer via la SOURCE UNIQUE (recalculerEtatPaiement dérive le statut des
// lignes réelles), par n'importe quel chemin (cron/Retenter admin, webhook échec,
// webhook succès, self-service). Exécuter : npx tsx scripts/test-echec-regularisation.mts
import { statutTrombi } from "../lib/paiement";

let ok = 0, ko = 0;
const check = (l: string, c: boolean, g?: unknown) => {
  if (c) { ok++; console.log(`  ✓ ${l}`); }
  else { ko++; console.log(`  ✗ ${l}` + (g !== undefined ? `  → ${JSON.stringify(g)}` : "")); }
};

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

const { recalculerEtatPaiement, marquerEcheancePayee, marquerEcheanceEchec, appliquerRegularisation, chargerEcheance } = await import("../lib/payments");
type SB = Parameters<typeof recalculerEtatPaiement>[1];
const adh = (o: Partial<Row> = {}): Row => ({ id: "D", prenom: "W", nom: "K", email: "", date_naissance: "2012-01-01", mode_paiement: "stripe_4x", nb_echeances: 4, echeances_payees: 3, statut_paiement: "echec_paiement", derniere_erreur_stripe: "insufficient_funds", derniere_erreur_code: "insufficient_funds", engage_at: "2026-09-09", annule_at: null, montant_total: 440, documents_valides: false, mail_dossier_complet_envoye: true, stripe_customer_id: "cus_x", prochaine_echeance: null, paiement_a_verifier: false, ...o });
const ech = (o: Partial<Row> & { numero_echeance: number }): Row => ({ id: `p${o.numero_echeance}`, adherent_id: "D", montant: 102.5, statut: "paye", date_prevue: null, date_paiement: null, stripe_payment_intent_id: null, echec_a: null, rappel_echec_envoye: false, mail_echec_envoye: false, mail_echec_admin_envoye: false, montant_rembourse: 0, ...o });

console.log("\n== A. Échéance intermédiaire régularisée (cas William) : en cours, plus d'alerte ==");
{
  const db = fakeDb({ adherents: [adh()], changements_formule: [], paiements: [
    ech({ numero_echeance: 1, date_prevue: "2026-09-09", stripe_payment_intent_id: "pi1" }),
    ech({ numero_echeance: 2, date_prevue: "2026-10-09", stripe_payment_intent_id: "pi2" }),
    ech({ numero_echeance: 3, statut: "paye", date_prevue: "2026-11-09", date_paiement: "2026-11-10", stripe_payment_intent_id: "pi3", echec_a: "2026-11-09", mail_echec_envoye: true, mail_echec_admin_envoye: true }),
    ech({ numero_echeance: 4, statut: "en_attente", date_prevue: "2026-12-09" }),
  ] });
  await recalculerEtatPaiement("D", db as unknown as SB);
  const a = db._t.adherents[0];
  check("statut_paiement → en_attente (plus d'échec)", a.statut_paiement === "en_attente", a.statut_paiement);
  check("derniere_erreur effacée", a.derniere_erreur_stripe === null && a.derniere_erreur_code === null);
  check("prochaine_echeance = 2026-12-09", a.prochaine_echeance === "2026-12-09", a.prochaine_echeance);
  check("trace d'échec CONSERVÉE sur la ligne réglée (echec_a non effacé)", db._t.paiements[2].echec_a === "2026-11-09");
  check("trombi = fractionné (vert), plus échec", statutTrombi(a as never).code === "fractionne");
}

console.log("\n== B. DERNIÈRE échéance régularisée : soldé, jamais en_attente ==");
{
  const db = fakeDb({ adherents: [adh({ echeances_payees: 3 })], changements_formule: [], paiements: [
    ech({ numero_echeance: 1, stripe_payment_intent_id: "pi1" }),
    ech({ numero_echeance: 2, stripe_payment_intent_id: "pi2" }),
    ech({ numero_echeance: 3, stripe_payment_intent_id: "pi3" }),
    ech({ numero_echeance: 4, statut: "paye", stripe_payment_intent_id: "pi4", echec_a: "2026-12-09", mail_echec_envoye: true }),
  ] });
  await recalculerEtatPaiement("D", db as unknown as SB);
  const a = db._t.adherents[0];
  check("statut_paiement → paye (soldé)", a.statut_paiement === "paye", a.statut_paiement);
  check("jamais en_attente", a.statut_paiement !== "en_attente");
  check("derniere_erreur effacée", a.derniere_erreur_stripe === null);
}

console.log("\n== C. Deux échéances en échec, une seule régularisée : l'alerte reste ==");
{
  const db = fakeDb({ adherents: [adh({ echeances_payees: 1 })], changements_formule: [], paiements: [
    ech({ numero_echeance: 1, stripe_payment_intent_id: "pi1" }),
    ech({ numero_echeance: 2, statut: "paye", stripe_payment_intent_id: "pi2", echec_a: "2026-10-09" }),
    ech({ numero_echeance: 3, statut: "echec", stripe_payment_intent_id: "pi3", echec_a: "2026-11-09" }),
    ech({ numero_echeance: 4, statut: "en_attente", date_prevue: "2026-12-09" }),
  ] });
  await recalculerEtatPaiement("D", db as unknown as SB);
  const a = db._t.adherents[0];
  check("statut_paiement RESTE echec_paiement (1 échéance encore en échec)", a.statut_paiement === "echec_paiement", a.statut_paiement);
}

console.log("\n== D. Régularisation par chaque chemin → alerte effacée ==");
{
  // Chemin cron / Retenter admin / webhook succès : tous via marquerEcheancePayee.
  const db1 = fakeDb({ adherents: [adh()], changements_formule: [], paiements: [
    ech({ numero_echeance: 1, stripe_payment_intent_id: "pi1" }),
    ech({ numero_echeance: 2, stripe_payment_intent_id: "pi2" }),
    ech({ numero_echeance: 3, statut: "echec", stripe_payment_intent_id: "pi3", echec_a: "2026-11-09" }),
    ech({ numero_echeance: 4, statut: "en_attente", date_prevue: "2026-12-09" }),
  ] });
  await marquerEcheancePayee("pi3", db1 as unknown as SB);
  check("cron/Retenter/webhook succès (marquerEcheancePayee) → en_attente", db1._t.adherents[0].statut_paiement === "en_attente", db1._t.adherents[0].statut_paiement);
  check("ligne 3 passée paye", db1._t.paiements[2].statut === "paye");

  // Chemin self-service : appliquerRegularisation (sans Stripe : pas de customer/pm).
  const db2 = fakeDb({ adherents: [adh()], changements_formule: [], paiements: [
    ech({ numero_echeance: 1, stripe_payment_intent_id: "pi1" }),
    ech({ numero_echeance: 2, stripe_payment_intent_id: "pi2" }),
    ech({ numero_echeance: 3, statut: "echec", stripe_payment_intent_id: "piX", echec_a: "2026-11-09" }),
    ech({ numero_echeance: 4, statut: "en_attente", date_prevue: "2026-12-09" }),
  ] });
  await appliquerRegularisation({ id: "piX", metadata: { adherentId: "D" }, customer: null, payment_method: null } as never, db2 as unknown as SB);
  check("self-service (appliquerRegularisation) → en_attente", db2._t.adherents[0].statut_paiement === "en_attente", db2._t.adherents[0].statut_paiement);

  // Chemin webhook ÉCHEC : marquerEcheanceEchec dérive bien echec_paiement.
  const db3 = fakeDb({ adherents: [adh({ statut_paiement: "en_attente", derniere_erreur_stripe: null, derniere_erreur_code: null, echeances_payees: 2 })], changements_formule: [], paiements: [
    ech({ numero_echeance: 1, stripe_payment_intent_id: "pi1" }),
    ech({ numero_echeance: 2, stripe_payment_intent_id: "pi2" }),
    ech({ numero_echeance: 3, statut: "en_attente", date_prevue: "2026-11-09", stripe_payment_intent_id: "pi3" }),
    ech({ numero_echeance: 4, statut: "en_attente", date_prevue: "2026-12-09" }),
  ] });
  await marquerEcheanceEchec("pi3", "Your card has insufficient funds.", "insufficient_funds", db3 as unknown as SB);
  check("webhook échec (marquerEcheanceEchec) → echec_paiement", db3._t.adherents[0].statut_paiement === "echec_paiement", db3._t.adherents[0].statut_paiement);
  check("webhook échec → derniere_erreur renseignée", db3._t.adherents[0].derniere_erreur_code === "insufficient_funds");
}

console.log("\n== E. « Retenter » sur une échéance DÉJÀ PAYÉE : aucun débit ==");
{
  const db = fakeDb({ adherents: [adh({ statut_paiement: "en_attente" })], changements_formule: [], paiements: [
    ech({ numero_echeance: 3, statut: "paye", stripe_payment_intent_id: "pi3", date_paiement: "2026-11-10" }),
  ] });
  const r = await chargerEcheance("p3", db as unknown as SB);
  check("chargerEcheance sur ligne payée → ok sans débit (garde idempotente)", r.ok === true && r.status === "succeeded", r);
  check("ligne inchangée (toujours payée, même PI)", db._t.paiements[0].statut === "paye" && db._t.paiements[0].stripe_payment_intent_id === "pi3");
}

console.log(`\nRésultat : ${ok} OK / ${ko} KO`);
process.exit(ko === 0 ? 0 : 1);
