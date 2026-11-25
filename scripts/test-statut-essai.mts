// [022] Fondations du suivi des essais : statutEssai (source unique dérivée),
// normalisation téléphone E.164 FR, provenance. Exécuter :
//   npx tsx scripts/test-statut-essai.mts
import { statutEssai, provenanceValide, provenanceLabel } from "../lib/statut-essai";
import { normaliserTelephoneFr, telephoneFrValide, formaterTelephoneFr } from "../lib/telephone";

let ok = 0, ko = 0;
const check = (l: string, c: boolean, g?: unknown) => {
  if (c) { ok++; console.log(`  ✓ ${l}`); }
  else { ko++; console.log(`  ✗ ${l}` + (g !== undefined ? `  → ${JSON.stringify(g)}` : "")); }
};

const NOW = new Date("2026-02-01T12:00:00Z");
const essai = (o: Partial<{ date_seance: string; converti_dossier_id: string | null; rappele_at: string | null }> = {}) =>
  ({ date_seance: "2026-01-15", converti_dossier_id: null, rappele_at: null, ...o });
const CONF = { conversionSeuilJours: 14 };

console.log("\n== statutEssai : les 5 statuts ==");
// EN ATTENTE : pas de dossier, essai récent (< 14 j).
check("en_attente (récent, sans dossier)", statutEssai(essai({ date_seance: "2026-01-28" }), null, [], NOW, CONF).code === "en_attente");
// À RAPPELER : pas de dossier, essai >= 14 j, pas rappelé.
check("a_rappeler (>= seuil, sans dossier)", statutEssai(essai({ date_seance: "2026-01-01" }), null, [], NOW, CONF).code === "a_rappeler");
// RAPPELÉ : pas de dossier, rappele_at posé (même ancien).
check("rappele (rappele_at posé)", statutEssai(essai({ date_seance: "2026-01-01", rappele_at: "2026-01-20" }), null, [], NOW, CONF).code === "rappele");
// DOSSIER EN COURS : dossier rattaché, non annulé, aucun encaissement.
check("dossier_en_cours (dossier non payé)", statutEssai(essai({ converti_dossier_id: "D" }), { annule_at: null, statut_paiement: "en_attente", echeances_payees: 0 }, [], NOW, CONF).code === "dossier_en_cours");
// INSCRIT : 1re échéance carte payée (encaissement réel).
const sCarte = statutEssai(essai({ converti_dossier_id: "D" }), { annule_at: null }, [{ statut: "paye", date_paiement: "2026-01-20T09:00:00Z" }], NOW, CONF);
check("inscrit (1re échéance carte payée)", sCarte.code === "inscrit" && sCarte.inscrit === true);

console.log("\n== Règles métier d'inscription ==");
// Espèces NON confirmées (aucune ligne payée) = pas inscrit.
check("espèces non confirmées → PAS inscrit (dossier_en_cours)", statutEssai(essai({ converti_dossier_id: "D" }), { annule_at: null, statut_paiement: "en_attente" }, [], NOW, CONF).code === "dossier_en_cours");
// Espèces CONFIRMÉES = ligne 'paye' (numéro null) → inscrit.
check("espèces confirmées (ligne payée) → inscrit", statutEssai(essai({ converti_dossier_id: "D" }), { annule_at: null, statut_paiement: "confirme_especes" }, [{ statut: "paye", date_paiement: "2026-01-25T00:00:00Z" }], NOW, CONF).code === "inscrit");
// Filet : pas de lignes fournies mais dossier confirme_especes → inscrit (date inconnue).
check("filet : dossier confirme_especes sans lignes → inscrit", statutEssai(essai({ converti_dossier_id: "D" }), { annule_at: null, statut_paiement: "confirme_especes" }, [], NOW, CONF).inscrit === true);
// Dossier ANNULÉ → traité comme non rattaché.
check("dossier annulé → non inscrit (retombe en a_rappeler)", statutEssai(essai({ date_seance: "2026-01-01", converti_dossier_id: "D" }), { annule_at: "2026-01-10" }, [{ statut: "paye", date_paiement: "2026-01-05" }], NOW, CONF).code === "a_rappeler");

console.log("\n== Inscription tardive : À RAPPELER → INSCRIT ==");
const tardifAvant = statutEssai(essai({ date_seance: "2025-12-01" }), null, [], NOW, CONF);
const tardifApres = statutEssai(essai({ date_seance: "2025-12-01", converti_dossier_id: "D" }), { annule_at: null }, [{ statut: "paye", date_paiement: "2026-01-31T00:00:00Z" }], NOW, CONF);
check("avant : a_rappeler", tardifAvant.code === "a_rappeler");
check("après inscription tardive : inscrit", tardifApres.code === "inscrit");

console.log("\n== Délai de conversion = 1er encaissement − 1re séance (jours) ==");
const d = statutEssai(essai({ date_seance: "2026-01-10", converti_dossier_id: "D" }), { annule_at: null }, [{ statut: "paye", date_paiement: "2026-01-25T10:00:00Z" }], NOW, CONF);
check("dateInscription = 2026-01-25", d.dateInscription === "2026-01-25", d);
check("delaiJours = 15", d.delaiJours === 15, d);
// Délai calculé sur la PLUS ANCIENNE séance (l'appelant passe la plus ancienne).
const dPlusAncien = statutEssai(essai({ date_seance: "2026-01-01", converti_dossier_id: "D" }), { annule_at: null }, [{ statut: "paye", date_paiement: "2026-01-25T00:00:00Z" }], NOW, CONF);
check("délai sur la 1re séance (01-01 → 24 j)", dPlusAncien.delaiJours === 24, dPlusAncien);
// 1er encaissement = date la plus ANCIENNE parmi les lignes payées.
const dMulti = statutEssai(essai({ date_seance: "2026-01-10", converti_dossier_id: "D" }), { annule_at: null }, [{ statut: "paye", date_paiement: "2026-02-10" }, { statut: "paye", date_paiement: "2026-01-20" }], NOW, CONF);
check("date d'inscription = 1er encaissement (le plus ancien)", dMulti.dateInscription === "2026-01-20", dMulti);

console.log("\n== Seuil lu dans la config ==");
check("seuil 30 j : essai de 20 j → en_attente", statutEssai(essai({ date_seance: "2026-01-12" }), null, [], NOW, { conversionSeuilJours: 30 }).code === "en_attente");
check("seuil 7 j : essai de 20 j → a_rappeler", statutEssai(essai({ date_seance: "2026-01-12" }), null, [], NOW, { conversionSeuilJours: 7 }).code === "a_rappeler");

console.log("\n== Téléphone : normalisation E.164 FR ==");
check("06 12 34 56 78 → +33612345678", normaliserTelephoneFr("06 12 34 56 78") === "+33612345678");
check("0612345678 → +33612345678", normaliserTelephoneFr("0612345678") === "+33612345678");
check("+33612345678 inchangé", normaliserTelephoneFr("+33612345678") === "+33612345678");
check("0033612345678 → +33612345678", normaliserTelephoneFr("0033612345678") === "+33612345678");
check("01.23.45.67.89 (fixe) → +33123456789", normaliserTelephoneFr("01.23.45.67.89") === "+33123456789");
check("09 70 00 00 00 accepté", normaliserTelephoneFr("09 70 00 00 00") === "+33970000000");
check("trop court → null", normaliserTelephoneFr("0612") === null);
check("vide → null", normaliserTelephoneFr("") === null);
check("lettres → null", normaliserTelephoneFr("abcdefghij") === null);
check("second chiffre 0 (00…) → null", normaliserTelephoneFr("0012345678") === null);
check("telephoneFrValide('0612345678')", telephoneFrValide("0612345678") === true);
check("telephoneFrValide('x') faux", telephoneFrValide("x") === false);
check("affichage +33612345678 → 06 12 34 56 78", formaterTelephoneFr("+33612345678") === "06 12 34 56 78");

console.log("\n== Provenance ==");
check("null accepté (facultatif)", provenanceValide(null) === true);
check("code connu accepté", provenanceValide("site_internet") === true);
check("'autre' accepté", provenanceValide("autre") === true);
check("code inconnu refusé", provenanceValide("zzz") === false);
check("label d'un code", provenanceLabel("site_internet", null) === "Site internet");
check("'autre' → texte libre", provenanceLabel("autre", "Instagram") === "Instagram");
check("'autre' sans texte → 'Autre'", provenanceLabel("autre", null) === "Autre");

console.log(`\nRésultat : ${ok} OK / ${ko} KO`);
process.exit(ko === 0 ? 0 : 1);
