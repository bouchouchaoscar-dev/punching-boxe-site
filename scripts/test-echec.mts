// Test automatisé de la LOGIQUE d'échec différencié (pur, sans réseau).
// Lance : npx tsx scripts/test-echec.mts
import { familleEchec, libelleEchecAdmin } from "../lib/stripe-erreurs";
import { syntheseDossier } from "../lib/synthese-dossier";
import type { Adherent } from "../lib/types";

let ok = 0;
let ko = 0;
function check(label: string, cond: boolean, got?: unknown) {
  if (cond) {
    ok++;
    console.log(`  ✓ ${label}`);
  } else {
    ko++;
    console.log(`  ✗ ${label}` + (got !== undefined ? `  → reçu: ${got}` : ""));
  }
}

// ---- 1) familleEchec : mapping des codes ----
console.log("\n[familleEchec]");
check("insufficient_funds → provision", familleEchec("insufficient_funds") === "provision");
check("expired_card → carte_morte", familleEchec("expired_card") === "carte_morte");
check("lost_card → carte_morte", familleEchec("lost_card") === "carte_morte");
check("stolen_card → carte_morte", familleEchec("stolen_card") === "carte_morte");
check("authentication_required → carte_morte", familleEchec("authentication_required") === "carte_morte");
check("do_not_honor → autre", familleEchec("do_not_honor") === "autre");
check("generic_decline → autre", familleEchec("generic_decline") === "autre");
check("null → autre", familleEchec(null) === "autre");
check("inconnu_xyz → autre", familleEchec("inconnu_xyz") === "autre");
check("INSUFFICIENT_FUNDS (casse) → provision", familleEchec("INSUFFICIENT_FUNDS") === "provision");

// ---- 2) libelleEchecAdmin ----
console.log("\n[libelleEchecAdmin]");
check("insufficient_funds → 'fonds insuffisants'", libelleEchecAdmin("insufficient_funds") === "fonds insuffisants");
check("expired_card → 'carte expirée'", libelleEchecAdmin("expired_card") === "carte expirée");
check("null → 'refus bancaire'", libelleEchecAdmin(null) === "refus bancaire");
check("do_not_honor → 'refus bancaire'", libelleEchecAdmin("do_not_honor") === "refus bancaire");

// ---- 3) Message adhérent (synthèse) par famille ----
// Dossier engagé (1 échéance payée sur 4), 2e échéance en échec.
const base = {
  mode_paiement: "stripe_4x",
  nb_echeances: 4,
  echeances_payees: 1,
  statut_paiement: "echec_paiement",
  // docs tous validés (n'intervient pas : echec&&engage est prioritaire)
  fiche_inscription_url: "x", fiche_valide: true,
  reglement_url: "x", reglement_valide: true,
  photo_url: "x", photo_valide: true,
  certificat_medical_url: "x", certificat_valide: true,
} as unknown as Adherent;

const paid = 1; // → échéance en échec = n°2

console.log("\n[syntheseDossier — provision]");
const sp = syntheseDossier({ ...base, derniere_erreur_code: "insufficient_funds" } as Adherent, paid);
check("tone danger", sp.tone === "danger", sp.tone);
check("mentionne 'provision'", /provision/i.test(sp.text), sp.text);
check("mentionne 'échéance 2'", /échéance 2/.test(sp.text), sp.text);
check("ne réclame PAS de nouvelle carte", !/nouvelle carte/i.test(sp.text), sp.text);

console.log("\n[syntheseDossier — carte_morte, échéance intermédiaire]");
const sc = syntheseDossier({ ...base, derniere_erreur_code: "expired_card" } as Adherent, paid);
check("tone danger", sc.tone === "danger", sc.tone);
check("réclame une nouvelle carte", /nouvelle carte/i.test(sc.text), sc.text);
check("mentionne 'plus valide'", /plus valide/i.test(sc.text), sc.text);
check("dit 'reprendre' (pas dernière)", /reprendre votre échéancier/.test(sc.text), sc.text);

console.log("\n[syntheseDossier — carte_morte, DERNIÈRE échéance]");
// 3 payées sur 4 → échéance en échec = n°4 = dernière.
const scLast = syntheseDossier(
  { ...base, echeances_payees: 3, derniere_erreur_code: "expired_card" } as Adherent,
  3,
);
check("dit 'finaliser' (dernière)", /finaliser votre échéancier/.test(scLast.text), scLast.text);
check("ne dit PAS 'reprendre'", !/reprendre/.test(scLast.text), scLast.text);

console.log("\n[syntheseDossier — autre]");
const sa = syntheseDossier({ ...base, derniere_erreur_code: "do_not_honor" } as Adherent, paid);
check("tone danger", sa.tone === "danger", sa.tone);
check("générique 'régulariser'", /régulariser/i.test(sa.text), sa.text);
check("mentionne 'échéance 2'", /échéance 2/.test(sa.text), sa.text);
check("n'accuse PAS la carte", !/nouvelle carte/i.test(sa.text), sa.text);

console.log("\n--- Aperçu des 3 messages adhérent ---");
console.log("provision   :", sp.text);
console.log("carte_morte :", sc.text);
console.log("autre       :", sa.text);

// ---- 4) Préfixe "paiement acquis + docs incomplets" reflète le nb réel (X/N) ----
// On force une pièce OBLIGATOIRE manquante (la photo) : c'est la branche qui
// affiche le préfixe X/N. NB : le certificat SEUL manquant ne bloque pas
// l'inscription et mène à une autre branche (cf. section 5).
console.log("\n[syntheseDossier — obligatoire (photo) manquant + fractionné 3/4]");
const baseOblig = {
  mode_paiement: "stripe_4x",
  nb_echeances: 4,
  echeances_payees: 3,
  statut_paiement: "en_attente",
  fiche_inscription_url: "x", fiche_valide: true,
  reglement_url: "x", reglement_valide: true,
  photo_url: null, photo_valide: false, // pièce obligatoire manquante
  certificat_medical_url: "x", certificat_valide: true,
} as unknown as Adherent;
const sOblig = syntheseDossier(baseOblig, 3);
check("tone action", sOblig.tone === "action", sOblig.tone);
check("préfixe reflète le nb réel d'échéances (3/4)", /3\/4 échéances sont réglées/.test(sOblig.text), sOblig.text);
check("ne dit PAS '1ère échéance' quand 3 sont payées", !/1ère échéance/.test(sOblig.text), sOblig.text);
check("réclame la pièce manquante (photo)", /photo/i.test(sOblig.text), sOblig.text);
console.log("texte :", sOblig.text);

// Même cas avec 1 seule échéance payée → préfixe "1ère échéance".
const sOblig1 = syntheseDossier({ ...baseOblig, echeances_payees: 1 } as Adherent, 1);
check("1 payée → '1ère échéance'", /1ère échéance est bien passée/.test(sOblig1.text), sOblig1.text);

// ---- 5) Certificat SEUL manquant, obligatoires OK + paiement acquis ----
// Comportement VOLONTAIRE (commit 151dd20, libellé affiné en 0364745) : le
// certificat dépend d'un médecin et ne bloque PAS l'inscription → l'inscription
// est validée, message rassurant mais qui rappelle l'obligation.
console.log("\n[syntheseDossier — certif seul manquant + fractionné 3/4]");
const sCertif = syntheseDossier(
  { ...baseOblig, photo_url: "x", photo_valide: true, certificat_medical_url: null, certificat_valide: false } as Adherent,
  3,
);
check("tone success (inscription validée)", sCertif.tone === "success", sCertif.tone);
check("dit que l'inscription est validée", /inscription est validée/i.test(sCertif.text), sCertif.text);
check("mentionne le certificat médical", /certificat médical/.test(sCertif.text), sCertif.text);
check("rappelle l'obligation (n'invalide pas le dossier)", /obligatoire/i.test(sCertif.text), sCertif.text);
console.log("texte :", sCertif.text);

console.log(`\nRésultat : ${ok} OK / ${ko} KO`);
process.exit(ko === 0 ? 0 : 1);
