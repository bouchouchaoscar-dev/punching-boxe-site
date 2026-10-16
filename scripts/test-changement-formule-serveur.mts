// Changement de formule — recalculerSupplement : SEUL écrivain de
// adherents.supplement_statut (dérivé), + activation cas b carte (option B).
// Exécuter : npx tsx scripts/test-changement-formule-serveur.mts
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

let ok = 0, ko = 0;
const check = (l: string, c: boolean, g?: unknown) => {
  if (c) { ok++; console.log(`  ✓ ${l}`); }
  else { ko++; console.log(`  ✗ ${l}` + (g !== undefined ? `  → ${JSON.stringify(g)}` : "")); }
};

// ---- Faux Supabase en mémoire (sous-ensemble utilisé par recalculerSupplement) ----
type Row = Record<string, unknown>;
function fakeDb(tables: Record<string, Row[]>) {
  function matched(rows: Row[], filtres: [string, unknown][]) {
    return rows.filter((r) => filtres.every(([k, v]) => r[k] === v));
  }
  return {
    from(table: string) {
      const rows = tables[table] ?? (tables[table] = []);
      return {
        select() {
          const filtres: [string, unknown][] = [];
          const chain = {
            eq(k: string, v: unknown) { filtres.push([k, v]); return chain; },
            is(k: string, v: unknown) { filtres.push([k, v]); return chain; },
            async maybeSingle() { return { data: matched(rows, filtres)[0] ?? null, error: null }; },
            then(res: (v: unknown) => unknown) { return Promise.resolve({ data: matched(rows, filtres), error: null }).then(res); },
          };
          return chain;
        },
        update(obj: Row) {
          const filtres: [string, unknown][] = [];
          const chain = {
            eq(k: string, v: unknown) {
              filtres.push([k, v]);
              return {
                then(res: (v: unknown) => unknown) {
                  for (const r of matched(rows, filtres)) Object.assign(r, obj);
                  return Promise.resolve({ data: null, error: null }).then(res);
                },
              };
            },
          };
          return chain;
        },
        insert(obj: Row) {
          const row: Row = { id: `row_${Math.random().toString(36).slice(2, 10)}`, ...obj };
          rows.push(row);
          const result = { data: row, error: null };
          return {
            select() { return { single: async () => result, async maybeSingle() { return result; } }; },
            then(res: (v: unknown) => unknown) { return Promise.resolve({ data: null, error: null }).then(res); },
          };
        },
        delete() {
          const filtres: [string, unknown][] = [];
          const chain = {
            eq(k: string, v: unknown) {
              filtres.push([k, v]);
              return {
                then(res: (v: unknown) => unknown) {
                  for (const r of matched(rows, filtres)) rows.splice(rows.indexOf(r), 1);
                  return Promise.resolve({ data: null, error: null }).then(res);
                },
              };
            },
          };
          return chain;
        },
      };
    },
    _t: tables,
  };
}

const { recalculerSupplement } = await import("../lib/payments");
const { appliquerChangementActif, choisirModeSupplement } = await import("../lib/changement-formule-server");
type SB = Parameters<typeof recalculerSupplement>[0];
const adherentBase = { id: "D", prenom: "Léa", nom: "T", email: "", date_naissance: "2000-01-01", stripe_customer_id: null };

console.log("\n== Cache supplement_statut dérivé (espèces) ==");
{
  const db = fakeDb({
    adherents: [{ id: "D", package: "boxe_classique", option_prepa_physique: true, supplement_statut: null }],
    changements_formule: [{ id: "C", dossier_id: "D", statut: "actif", mode_reglement: "especes", montant_cents: 3500, paiement_id: "P", nouvelle_formule: "boxe_prepa", signature_requise: true }],
    paiements: [{ id: "P", adherent_id: "D", statut: "en_attente", numero_echeance: null }],
  });
  await recalculerSupplement(db as unknown as SB, "D");
  check("supplément espèces non confirmé → supplement_statut = attente_especes", db._t.adherents[0].supplement_statut === "attente_especes", db._t.adherents[0]);
  // Confirmation espèces (paiement payé) → cache null.
  db._t.paiements[0].statut = "paye";
  await recalculerSupplement(db as unknown as SB, "D");
  check("supplément espèces encaissé → supplement_statut null", db._t.adherents[0].supplement_statut === null);
}

console.log("\n== Cache supplement_statut (carte actif non encaissé) ==");
{
  const db = fakeDb({
    adherents: [{ id: "D", package: "boxe_classique", option_prepa_physique: true, supplement_statut: null }],
    changements_formule: [{ id: "C", dossier_id: "D", statut: "actif", mode_reglement: "carte", montant_cents: 3500, paiement_id: "P", nouvelle_formule: "boxe_prepa" }],
    paiements: [{ id: "P", adherent_id: "D", statut: "en_attente", numero_echeance: null }],
  });
  await recalculerSupplement(db as unknown as SB, "D");
  check("supplément carte non encaissé → à finaliser", db._t.adherents[0].supplement_statut === "a_finaliser");
}

console.log("\n== Activation cas b carte (option B) : formule activée au paiement ==");
{
  const db = fakeDb({
    adherents: [{ id: "D", package: "boxe_classique", option_prepa_physique: false, supplement_statut: null, fiche_a_resigner: false, prenom: "Léa", nom: "T", email: "", date_naissance: "2000-01-01" }],
    changements_formule: [{ id: "C", dossier_id: "D", statut: "en_attente_paiement", mode_reglement: "carte", montant_cents: 3500, paiement_id: "P", nouvelle_formule: "boxe_prepa", signature_requise: true }],
    paiements: [{ id: "P", adherent_id: "D", statut: "paye", numero_echeance: null }],
  });
  await recalculerSupplement(db as unknown as SB, "D");
  const a = db._t.adherents[0];
  const c = db._t.changements_formule[0];
  check("carte payée → formule activée (option_prepa true)", a.package === "boxe_classique" && a.option_prepa_physique === true, a);
  check("carte payée → fiche à re-signer", a.fiche_a_resigner === true);
  check("carte payée → changement passe 'actif'", c.statut === "actif");
  check("carte payée → supplement_statut null (encaissé)", a.supplement_statut === null);
}

console.log("\n== Abandon (carte en attente, non payée) → rien ne change ==");
{
  const db = fakeDb({
    adherents: [{ id: "D", package: "boxe_classique", option_prepa_physique: false, supplement_statut: null, fiche_a_resigner: false }],
    changements_formule: [{ id: "C", dossier_id: "D", statut: "en_attente_paiement", mode_reglement: "carte", montant_cents: 3500, paiement_id: "P", nouvelle_formule: "boxe_prepa" }],
    paiements: [{ id: "P", adherent_id: "D", statut: "en_attente", numero_echeance: null }],
  });
  await recalculerSupplement(db as unknown as SB, "D");
  const a = db._t.adherents[0];
  check("non payé → formule inchangée", a.option_prepa_physique === false);
  check("non payé → fiche inchangée", a.fiche_a_resigner === false);
  check("non payé → pas de supplément en attente (en_attente_paiement, pas actif)", a.supplement_statut === null);
}

console.log("\n== Reshape : l'adhérent choisit le mode (admin pose 'a_regler') ==");
{
  // Admin « À régler par l'adhérent » sur un dossier ENGAGÉ (cas b) → mode a_regler,
  // AUCUN paiement créé au clic (l'adhérent choisira), supplement_statut = a_finaliser.
  const db = fakeDb({ adherents: [{ ...adherentBase, package: "boxe_classique", option_prepa_physique: false, montant_total: 380, supplement_statut: null, fiche_a_resigner: false }] });
  await appliquerChangementActif(db as unknown as SB, { ...adherentBase, package: "boxe_classique", option_prepa_physique: false } as never, {
    nouvelleCle: "boxe_prepa", montantEuros: 150, modeReglement: "a_regler", source: "admin", createdBy: "admin", signatureRequise: true,
  });
  const ch = db._t.changements_formule[0];
  check("a_regler : changement mode = a_regler", ch.mode_reglement === "a_regler");
  check("a_regler : AUCUN paiement créé au clic (adhérent choisira)", (db._t.paiements ?? []).length === 0);
  check("a_regler : supplement_statut = a_finaliser (rouge, à finaliser)", db._t.adherents[0].supplement_statut === "a_finaliser");
  check("a_regler : montant_total inchangé (cas b séparé)", db._t.adherents[0].montant_total === 380);
}

console.log("\n== Reshape : « Réglé sur place en espèces » (cas b engagé) = encaissé ==");
{
  const db = fakeDb({ adherents: [{ ...adherentBase, package: "boxe_classique", option_prepa_physique: false, montant_total: 380, supplement_statut: null, fiche_a_resigner: false }] });
  await appliquerChangementActif(db as unknown as SB, { ...adherentBase, package: "boxe_classique", option_prepa_physique: false } as never, {
    nouvelleCle: "boxe_prepa", montantEuros: 150, modeReglement: "especes", source: "admin", createdBy: "admin", signatureRequise: true, encaisse: true,
  });
  const p = db._t.paiements[0];
  check("réglé sur place : ligne paiement créée « paye » (encaissée)", p.statut === "paye" && p.montant === 150);
  check("réglé sur place : date_paiement posée", p.date_paiement != null);
  check("réglé sur place : aucune attente (supplement_statut null)", db._t.adherents[0].supplement_statut === null);
}

console.log("\n== Reshape : « Offert » = aucun montant dû ==");
{
  const db = fakeDb({ adherents: [{ ...adherentBase, package: "boxe_classique", option_prepa_physique: false, montant_total: 380, supplement_statut: null, fiche_a_resigner: false }] });
  await appliquerChangementActif(db as unknown as SB, { ...adherentBase, package: "boxe_classique", option_prepa_physique: false } as never, {
    nouvelleCle: "boxe_prepa", montantEuros: 0, modeReglement: "offert", source: "admin", createdBy: "admin", signatureRequise: true,
  });
  check("offert : aucune ligne paiement", (db._t.paiements ?? []).length === 0);
  check("offert : supplement_statut null (rien à régler)", db._t.adherents[0].supplement_statut === null);
  check("offert : formule tout de même activée", db._t.adherents[0].option_prepa_physique === true);
}

console.log("\n== Reshape : cas a (non engagé) = fusion dans le total (ex 380 → 530) ==");
{
  const db = fakeDb({ adherents: [{ ...adherentBase, package: "boxe_classique", option_prepa_physique: false, montant_total: 380, supplement_statut: null, fiche_a_resigner: false }] });
  await appliquerChangementActif(db as unknown as SB, { ...adherentBase, package: "boxe_classique", option_prepa_physique: false } as never, {
    nouvelleCle: "boxe_prepa", montantEuros: 150, modeReglement: null, source: "admin", createdBy: "admin", signatureRequise: true, nouveauTotal: 530,
  });
  check("cas a : montant_total fusionné 380 → 530", db._t.adherents[0].montant_total === 530);
  check("cas a : AUCUN paiement séparé", (db._t.paiements ?? []).length === 0);
  check("cas a : supplement_statut null (fusionné, suit le flux cotisation)", db._t.adherents[0].supplement_statut === null);
  check("cas a : changement tracé mode null", db._t.changements_formule[0].mode_reglement === null);
}

console.log("\n== Reshape : choisirModeSupplement — l'adhérent prend ESPÈCES ==");
{
  const db = fakeDb({
    adherents: [{ ...adherentBase, package: "boxe_classique", option_prepa_physique: true, supplement_statut: "a_finaliser" }],
    changements_formule: [{ id: "C", dossier_id: "D", statut: "actif", mode_reglement: "a_regler", montant_cents: 15000, paiement_id: null, nouvelle_formule: "boxe_prepa" }],
  });
  await choisirModeSupplement(db as unknown as SB, { ...adherentBase, package: "boxe_classique", option_prepa_physique: true } as never, { id: "C", montant_cents: 15000 }, "especes");
  const p = db._t.paiements[0];
  check("adhérent choisit espèces : ligne paiement « en_attente »", p.statut === "en_attente" && p.montant === 150);
  check("adhérent choisit espèces : changement mode → especes", db._t.changements_formule[0].mode_reglement === "especes");
  check("adhérent choisit espèces : supplement_statut → attente_especes (plus de relance paiement)", db._t.adherents[0].supplement_statut === "attente_especes");
}

console.log("\n== Garde-fous statiques (single writer, endpoints, propagation) ==");
const here = dirname(fileURLToPath(import.meta.url));
const read = (p: string) => readFileSync(join(here, "..", p), "utf8");

// SINGLE WRITER : aucune écriture de supplement_statut hors recalculerSupplement.
const SRC = [
  "lib/changement-formule-server.ts",
  "app/api/mon-espace/ajouter-prepa/route.ts",
  "app/api/admin/adherents/[id]/changer-formule/route.ts",
  "app/api/mon-espace/supplement/confirm/route.ts",
];
const ecrituresAilleurs = SRC.some((p) => /supplement_statut\s*:/.test(read(p)));
check("supplement_statut écrit UNIQUEMENT par recalculerSupplement (pas ailleurs)", !ecrituresAilleurs);
check("payments.ts : recalculerSupplement écrit supplement_statut", /supplement_statut: cible/.test(read("lib/payments.ts")));
check("payments.ts : recalculerSupplement appelé en fin de recalculerEtatPaiement", read("lib/payments.ts").includes("await recalculerSupplement(supabase, adherentId);"));

const adh = read("app/api/mon-espace/ajouter-prepa/route.ts");
check("adhérent : prix calculé serveur (prixOptionPrepa), jamais du client", adh.includes("prixOptionPrepa(new Date())") && !/body\.(montant|prix|total)/.test(adh));
check("adhérent : cas a sans encaissement (!estEngage)", adh.includes("!estEngage(adherent)"));
check("adhérent : cas b carte → creerSupplementCarte (formule non activée au clic)", adh.includes("creerSupplementCarte"));
check("adhérent : éligibilité peutAjouterPrepa (BF seule)", adh.includes("peutAjouterPrepa(adherent)"));

const admin = read("app/api/admin/adherents/[id]/changer-formule/route.ts");
check("admin : garde isAdminRequest (fail-closed)", admin.includes("isAdminRequest(request)") && admin.includes("Non autorisé"));
check("admin : activation immédiate (appliquerChangementActif)", admin.includes("appliquerChangementActif"));
check("admin : règlement = a_regler | especes_sur_place | offert (plus de « lien carte »)", admin.includes('"a_regler"') && admin.includes('"especes_sur_place"') && admin.includes('"offert"'));
check("admin : « réglé sur place » engagé → espèces encaissées (encaisse)", admin.includes("encaisse = true"));
check("admin : « à régler » engagé → mode a_regler (choix adhérent)", admin.includes('mode = "a_regler"'));

const confirm = read("app/api/mon-espace/supplement/confirm/route.ts");
check("confirm carte : marquerEcheancePayee → activation via recalcul", confirm.includes("marquerEcheancePayee(intent.id)"));

const cron = read("app/api/cron/charge-echeances/route.ts");
check("relances : source 'adherent' = SIGNATURE uniquement", cron.includes('ch.source === "adherent"') && cron.includes("paiementCarte: false"));
check("relances : claim idempotent (.is(col, null))", cron.includes(".is(col, null)"));
check("relances : exclusions (invalides/désinscrits/bounces)", cron.includes("estEmailValide(email)") && cron.includes("exclusions.has(email)"));

const facture = read("lib/pdf/facture-gen.tsx");
check("facture : ligne supplément « option préparation physique, ajoutée le »", facture.includes("Option préparation physique, ajoutée le"));
check("facture : suppléments encaissés inclus au total réglé", facture.includes("regleAJour + supPaye"));

// UI : espace adhérent + admin.
const espace = read("components/espace/MonEspace.tsx");
check("espace : bouton « Ajouter la prépa physique » (peutAjouterPrepa)", espace.includes("Ajouter la prépa physique") && espace.includes("peutAjouterPrepa(a)"));
check("espace : modale AjouterPrepaModal branchée", espace.includes("AjouterPrepaModal"));
const fiche = read("components/admin/FicheAdherent.tsx");
check("admin : bouton « Gérer la formule »", fiche.includes("Gérer la formule"));
check("admin : modale GererFormuleModal", fiche.includes("GererFormuleModal"));
check("admin : section historique « Changements de formule »", fiche.includes("Changements de formule"));
const modaleAdmin = read("components/admin/GererFormuleModal.tsx");
check("admin modale : 3 formules (FORMULES_CLE) + récap + confirmation", modaleAdmin.includes("FORMULES_CLE.map") && modaleAdmin.includes("Confirmer le changement"));
check("admin modale : choix supplément « À régler par l'adhérent » (défaut) / sur place / offert", modaleAdmin.includes("À régler par l") && modaleAdmin.includes("Réglé sur place en espèces") && modaleAdmin.includes('useState<"a_regler"'));
const espaceSup = read("components/espace/ReglerSupplementModal.tsx");
check("espace : « Régler le supplément » (carte / espèces au choix de l'adhérent)", espaceSup.includes("supplement/choisir") && espaceSup.includes("Payer par carte") && espaceSup.includes("Régler en espèces"));
check("espace : MonEspace branche ReglerSupplementModal", espace.includes("ReglerSupplementModal") && espace.includes("Régler le supplément"));

console.log(`\nRésultat : ${ok} OK / ${ko} KO`);
process.exit(ko === 0 ? 0 : 1);
