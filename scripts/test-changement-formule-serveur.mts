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
      };
    },
    _t: tables,
  };
}

const { recalculerSupplement } = await import("../lib/payments");
type SB = Parameters<typeof recalculerSupplement>[0];

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

console.log(`\nRésultat : ${ok} OK / ${ko} KO`);
process.exit(ko === 0 ? 0 : 1);
