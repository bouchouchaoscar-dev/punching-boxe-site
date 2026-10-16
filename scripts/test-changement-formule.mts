// Changement de formule — socle PUR : éligibilité, prix option, labels, relances,
// et layering statutTrombi du supplément. Exécuter : npx tsx scripts/test-changement-formule.mts
import {
  estBoxeSeule, peutAjouterPrepa, prixOptionPrepa, labelFormuleCle, cleVersDossier,
  restantChangement, changementAFaire, mailRelanceChangement,
} from "../lib/changement-formule";
import { prepaDuMois } from "../lib/pricing";
import { statutTrombi } from "../lib/paiement";

let ok = 0, ko = 0;
const check = (l: string, c: boolean, g?: unknown) => {
  if (c) { ok++; console.log(`  ✓ ${l}`); }
  else { ko++; console.log(`  ✗ ${l}` + (g !== undefined ? `  → ${JSON.stringify(g)}` : "")); }
};

console.log("\n== Éligibilité « ajouter la prépa » (BF seule, non annulé) ==");
check("BF seule → éligible", peutAjouterPrepa({ package: "boxe_classique", option_prepa_physique: false, annule_at: null }));
check("BF seule : estBoxeSeule vrai", estBoxeSeule({ package: "boxe_classique", option_prepa_physique: false }));
check("BF + prépa → NON éligible", !peutAjouterPrepa({ package: "boxe_classique", option_prepa_physique: true, annule_at: null }));
check("Savate + Prépa → NON éligible", !peutAjouterPrepa({ package: "savate_prepa", option_prepa_physique: false, annule_at: null }));
check("BF seule mais annulé → NON éligible", !peutAjouterPrepa({ package: "boxe_classique", option_prepa_physique: false, annule_at: "2026-10-01" }));

console.log("\n== Prix option = palier dégressif du jour (moteur réutilisé) ==");
const d = new Date("2026-10-16T12:00:00");
check("prixOptionPrepa = prepaDuMois", prixOptionPrepa(d) === prepaDuMois(d));

console.log("\n== Labels & conversion clé ↔ dossier ==");
check("label boxe", labelFormuleCle("boxe") === "Boxe Française");
check("label boxe_prepa", labelFormuleCle("boxe_prepa") === "Boxe Française + Prépa");
check("label savate_prepa", labelFormuleCle("savate_prepa") === "Savate et Prépa");
check("cleVersDossier(boxe_prepa)", JSON.stringify(cleVersDossier("boxe_prepa")) === JSON.stringify({ package: "boxe_classique", option_prepa_physique: true }));
check("cleVersDossier(savate_prepa)", JSON.stringify(cleVersDossier("savate_prepa")) === JSON.stringify({ package: "savate_prepa", option_prepa_physique: false }));

console.log("\n== Relances admin : ce qui reste à faire ==");
const base = { source: "admin", statut: "actif", signature_requise: true, signe_at: null };
check("carte non payée + non signé → les deux", (() => { const r = restantChangement({ ...base, mode_reglement: "carte", supplementPaye: false }); return r.paiementCarte && r.signature; })());
check("carte payée + non signé → signature seule", (() => { const r = restantChangement({ ...base, mode_reglement: "carte", supplementPaye: true }); return !r.paiementCarte && r.signature; })());
check("carte non payée + signé → paiement seul", (() => { const r = restantChangement({ ...base, signe_at: "2026-10-10", mode_reglement: "carte", supplementPaye: false }); return r.paiementCarte && !r.signature; })());
check("espèces → aucune relance (réglé sur place)", !changementAFaire(restantChangement({ ...base, signe_at: "2026-10-10", mode_reglement: "especes", supplementPaye: false })));
check("offert signé → aucune relance", !changementAFaire(restantChangement({ ...base, signe_at: "2026-10-10", mode_reglement: "offert", supplementPaye: false })));
check("annulé → aucune relance", !changementAFaire(restantChangement({ ...base, statut: "annule", mode_reglement: "carte", supplementPaye: false })));

console.log("\n== Contenu adaptatif des relances ==");
const m1deux = mailRelanceChangement({ prenom: "Léa", mineur: false, numero: 1, restant: { paiementCarte: true, signature: true }, montantEuros: 35, clubNom: "Le Club" });
check("objet relance 1 exact", m1deux.objet === "Votre formule a été mise à jour : une dernière étape");
check("les deux → boutons payer + signer", JSON.stringify(m1deux.boutons) === JSON.stringify(["payer", "signer"]));
check("mentionne le montant", m1deux.corps.join(" ").includes("35 €"));
const m1pay = mailRelanceChangement({ prenom: "Léa", mineur: false, numero: 1, restant: { paiementCarte: true, signature: false }, montantEuros: 35, clubNom: "Le Club" });
check("paiement seul → bouton payer", JSON.stringify(m1pay.boutons) === JSON.stringify(["payer"]));
const m1sign = mailRelanceChangement({ prenom: "Léa", mineur: true, numero: 1, restant: { paiementCarte: false, signature: true }, montantEuros: 0, clubNom: "Le Club" });
check("signature seule → bouton signer", JSON.stringify(m1sign.boutons) === JSON.stringify(["signer"]));
check("mineur → salutation neutre", m1sign.salutation === "Bonjour,");
const m2 = mailRelanceChangement({ prenom: "Léa", mineur: false, numero: 2, restant: { paiementCarte: true, signature: false }, montantEuros: 35, clubNom: "Le Club" });
check("objet relance 2 exact", m2.objet === "Petit rappel pour finaliser votre nouvelle formule");
check("relance 2 → dernier message", m2.corps.join(" ").includes("dernier message automatique"));
const tout = [m1deux, m1pay, m1sign, m2].flatMap((m) => [m.objet, m.salutation, ...m.corps, m.signature]).join(" ");
check("aucun tiret long", !tout.includes("—"), tout);

console.log("\n== statutTrombi : layering du supplément (aucune autre règle modifiée) ==");
type A = Parameters<typeof statutTrombi>[0];
const paye: Record<string, unknown> = { statut_paiement: "paye", mode_paiement: "stripe_1x", nb_echeances: 1, echeances_payees: 1, engage_at: "2026-09-01", annule_at: null, paiement_a_verifier: false, supplement_statut: null };
const st = (o: Record<string, unknown>) => statutTrombi({ ...paye, ...o } as A);
check("cotisation payée, pas de supplément → vert payé carte", st({}).code === "paye_carte" && st({}).couleur === "vert");
check("payée + supplément carte → à finaliser (rouge)", st({ supplement_statut: "a_finaliser" }).code === "a_finaliser" && st({ supplement_statut: "a_finaliser" }).couleur === "rouge");
check("payée + supplément espèces → espèces en attente (orange)", st({ supplement_statut: "attente_especes" }).code === "attente_especes" && st({ supplement_statut: "attente_especes" }).couleur === "orange");
check("annulé → supplément ignoré", st({ annule_at: "2026-10-01", supplement_statut: "a_finaliser" }).code !== "a_finaliser" || st({ annule_at: "2026-10-01", supplement_statut: "a_finaliser" }).couleur !== "rouge");
// Cotisation PAS réglée (base rouge) → le supplément ne change rien (base prime).
const nonRegle: Record<string, unknown> = { statut_paiement: "en_attente", mode_paiement: null, nb_echeances: 1, echeances_payees: 0, engage_at: null, annule_at: null, supplement_statut: "attente_especes" };
check("cotisation non réglée → base inchangée (a_finaliser), supplément n'écrase pas", statutTrombi(nonRegle as A).code === "a_finaliser");

console.log(`\nRésultat : ${ok} OK / ${ko} KO`);
process.exit(ko === 0 ? 0 : 1);
