// Relance des DOSSIERS sans mode de paiement (statut « à finaliser », mode null).
// Couvre : sélection, délais, idempotence, contenu adaptatif, exclusions (statiques).
// Exécuter : npx tsx scripts/test-relance-dossier.mts
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import {
  estDossierARelancer,
  numeroRelanceDossier,
  etatDossierRelance,
  mailRelanceDossier,
} from "../lib/relance-dossier";

let ok = 0, ko = 0;
const check = (l: string, c: boolean, g?: unknown) => {
  if (c) { ok++; console.log(`  ✓ ${l}`); }
  else { ko++; console.log(`  ✗ ${l}` + (g !== undefined ? `  → ${JSON.stringify(g)}` : "")); }
};

type Sel = Parameters<typeof estDossierARelancer>[0];
const baseSel: Sel = {
  statut_paiement: "en_attente", mode_paiement: null,
  nb_echeances: null, echeances_payees: 0, engage_at: null, annule_at: null,
};
const sel = (o: Partial<Sel>) => estDossierARelancer({ ...baseSel, ...o });

console.log("\n== Sélection (estDossierARelancer) ==");
check("mode null, rien encaissé → sélectionné", sel({}) === true, sel({}));
check("carte non finalisée (mode stripe) → NON (couvert par paniers)", sel({ mode_paiement: "stripe_3x", nb_echeances: 3 }) === false);
check("espèces en attente → NON", sel({ mode_paiement: "especes" }) === false);
check("payé (soldé) → NON", sel({ statut_paiement: "paye", mode_paiement: "stripe_2x", nb_echeances: 2, echeances_payees: 2 }) === false);
check("annulé → NON", sel({ annule_at: "2026-09-01" }) === false);
check("engagé → NON", sel({ engage_at: "2026-09-01" }) === false);
check("au moins une échéance payée → NON", sel({ echeances_payees: 1 }) === false);

console.log("\n== Délais (numeroRelanceDossier) ==");
const now = new Date("2026-09-30T12:00:00Z").getTime();
const J = 24 * 60 * 60 * 1000;
const ago = (d: number) => new Date(now - d * J).toISOString();
const num = (o: { createdAt: string; relance1At?: string | null; relance2At?: string | null }) =>
  numeroRelanceDossier({ createdAt: o.createdAt, relance1At: o.relance1At ?? null, relance2At: o.relance2At ?? null, now, jours1: 3, jours2: 7 });

check("créé il y a 2 j, pas de relance → rien (< 3 j)", num({ createdAt: ago(2) }) === null);
check("créé il y a 3 j → relance 1", num({ createdAt: ago(3) }) === 1);
check("créé il y a 5 j → relance 1", num({ createdAt: ago(5) }) === 1);
check("relance 1 il y a 5 j → rien (< 7 j)", num({ createdAt: ago(20), relance1At: ago(5) }) === null);
check("relance 1 il y a 7 j → relance 2", num({ createdAt: ago(20), relance1At: ago(7) }) === 2);
check("relance 1 + relance 2 déjà posées → rien", num({ createdAt: ago(30), relance1At: ago(20), relance2At: ago(10) }) === null);

console.log("\n== Idempotence (une fois posée, pas de re-déclenchement) ==");
check("relance 1 posée aujourd'hui → ne redéclenche pas 1", num({ createdAt: ago(10), relance1At: ago(0) }) === null);
check("relance 2 posée → plus jamais rien", num({ createdAt: ago(40), relance1At: ago(30), relance2At: ago(0) }) === null);

console.log("\n== Contenu adaptatif (etatDossierRelance) ==");
const rien = etatDossierRelance({});
check("rien fait → etat 'rien'", rien.etat === "rien", rien);
check("rien fait → manques inclut le paiement", rien.manques.includes("le choix du mode de paiement"));
const partiel = etatDossierRelance({ fiche_valide: true, reglement_valide: true, fiche_signee_at: "2026-09-28", reglement_signee_at: "2026-09-28", photo_url: "p.jpg" });
check("docs partiels → etat 'partiel'", partiel.etat === "partiel", partiel);
check("partiel → manque le certificat médical", partiel.manques.includes("le certificat médical"));
check("partiel → manque aussi le choix du mode de paiement", partiel.manques.includes("le choix du mode de paiement"));
const complet = etatDossierRelance({ fiche_valide: true, reglement_valide: true, photo_valide: true, certificat_valide: true, certificat_medical_url: "c.pdf", fiche_signee_at: "x", reglement_signee_at: "x", photo_url: "p" });
check("docs complets → etat 'complet'", complet.etat === "complet", complet);
check("complet → seul le paiement reste", complet.manques.length === 1 && complet.manques[0] === "le choix du mode de paiement");

console.log("\n== Contenu mail (mailRelanceDossier) ==");
const m1 = mailRelanceDossier({ prenom: "Nayel", mineur: false, numero: 1, etat: "rien", manques: rien.manques, clubNom: "Le Club" });
check("objet relance 1 exact", m1.objet === "Votre inscription est presque terminée", m1.objet);
check("salutation majeur avec prénom", /Nayel/.test(m1.salutation), m1.salutation);
check("bouton = Compléter mon inscription", m1.boutonLabel === "Compléter mon inscription");
check("relance 1 → pas de mention 'dernier message'", !m1.corps.join(" ").includes("dernier message"));
const m2 = mailRelanceDossier({ prenom: "Rayane", mineur: false, numero: 2, etat: "partiel", manques: partiel.manques, clubNom: "Le Club" });
check("objet relance 2 exact", m2.objet === "Il ne manque plus grand-chose pour votre inscription", m2.objet);
check("relance 2 → mention dernier message auto", m2.corps.join(" ").includes("dernier message automatique"));
check("partiel → corps cite le certificat médical", m2.corps.join(" ").includes("certificat médical"));
const mMineur = mailRelanceDossier({ prenom: "Lina", mineur: true, numero: 1, etat: "complet", manques: complet.manques, clubNom: "Le Club" });
check("mineur → salutation neutre (parent)", mMineur.salutation === "Bonjour,", mMineur.salutation);
check("mineur complet → cite le prénom de l'enfant dans le corps", mMineur.corps.join(" ").includes("Lina"));
const corpsTous = [m1, m2, mMineur].flatMap((m) => [m.objet, m.salutation, ...m.corps, m.signature]).join(" ");
check("aucun tiret long (—) dans le contenu", !corpsTous.includes("—"), corpsTous);

console.log("\n== Exclusions (garde-fous statiques du cron) ==");
const here = dirname(fileURLToPath(import.meta.url));
const cron = readFileSync(join(here, "../app/api/cron/charge-echeances/route.ts"), "utf8");
const fn = cron.slice(cron.indexOf("async function relancerDossiersSansPaiement"), cron.indexOf("async function relancerPaniersAbandonnes"));
check("charge les exclusions (désinscrits + bounces)", fn.includes("chargerExclusionsMail"));
check("filtre les emails invalides (estEmailValide)", fn.includes("estEmailValide"));
check("claim atomique .is(col, null)", fn.includes(".is(col, null)"));
check("exclusions vérifiées AVANT le claim", fn.indexOf("exclusions.has(email)") < fn.indexOf(".is(col, null)"));

console.log(`\nRésultat : ${ok} OK / ${ko} KO`);
process.exit(ko === 0 ? 0 : 1);
