// Changement de formule — socle PUR : éligibilité, prix option, labels, relances,
// et layering statutTrombi du supplément. Exécuter : npx tsx scripts/test-changement-formule.mts
import {
  estBoxeSeule, peutAjouterPrepa, prixOptionPrepa, labelFormuleCle, cleVersDossier,
  restantChangement, changementAFaire, mailRelanceChangement,
  calculerSupplementStatut, changementActivable, resoudreChangementAdmin,
  diffDisciplines, phrasesChangementDisciplines, disciplinesDeFormule,
} from "../lib/changement-formule";
import { prepaDuMois, formuleCle } from "../lib/pricing";
import { statutTrombi } from "../lib/paiement";
import { adherentDansDiscipline } from "../lib/planning";

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
// Nouveau flux : mode choisi par l'adhérent ('a_regler', tant que rien choisi).
check("à régler (mode non choisi) + signé → relance paiement", (() => { const r = restantChangement({ ...base, signe_at: "2026-10-10", mode_reglement: "a_regler", supplementPaye: false }); return r.paiementCarte && !r.signature; })());
check("à régler mais déjà encaissé → plus de relance paiement", !restantChangement({ ...base, signe_at: "2026-10-10", mode_reglement: "a_regler", supplementPaye: true }).paiementCarte);

console.log("\n== calculerSupplementStatut : dérivation du cache (réalité) ==");
const chBase = { statut: "actif", montant_cents: 15000, encaisseCents: 0 };
check("'a_regler' actif non encaissé → a_finaliser", calculerSupplementStatut([{ ...chBase, mode_reglement: "a_regler" }]) === "a_finaliser");
check("carte actif non encaissé → a_finaliser", calculerSupplementStatut([{ ...chBase, mode_reglement: "carte" }]) === "a_finaliser");
check("espèces actif → attente_especes", calculerSupplementStatut([{ ...chBase, mode_reglement: "especes" }]) === "attente_especes");
check("espèces PARTIEL (encaissé < dû) → attente_especes", calculerSupplementStatut([{ ...chBase, mode_reglement: "especes", encaisseCents: 5000 }]) === "attente_especes");
check("carte encaissé (>=dû) → null", calculerSupplementStatut([{ ...chBase, mode_reglement: "carte", encaisseCents: 15000 }]) === null);
check("espèces SOLDÉ en plusieurs fois → null", calculerSupplementStatut([{ ...chBase, mode_reglement: "especes", encaisseCents: 15000 }]) === null);
check("fusionné (mode null) → null (cas a)", calculerSupplementStatut([{ ...chBase, mode_reglement: null }]) === null);
check("offert → null", calculerSupplementStatut([{ ...chBase, mode_reglement: "offert" }]) === null);
check("montant 0 → null", calculerSupplementStatut([{ ...chBase, montant_cents: 0, mode_reglement: "a_regler" }]) === null);
check("non actif → ignoré", calculerSupplementStatut([{ ...chBase, statut: "annule", mode_reglement: "a_regler" }]) === null);
check("règle la plus défavorable : a_regler prime sur espèces", calculerSupplementStatut([{ ...chBase, mode_reglement: "especes" }, { ...chBase, mode_reglement: "a_regler" }]) === "a_finaliser");
check("activable : carte en_attente_paiement encaissé", changementActivable({ statut: "en_attente_paiement", mode_reglement: "carte", paiementStatut: "paye" }));
check("non activable : espèces", !changementActivable({ statut: "en_attente_paiement", mode_reglement: "especes", paiementStatut: "paye" }));

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

console.log("\n== resoudreChangementAdmin : fail-closed (supplément = à régler / offert) ==");
const R = (o: Parameters<typeof resoudreChangementAdmin>[0]) => resoudreChangementAdmin(o);
// Supplément « à régler par l'adhérent ».
check("à régler + non engagé → fusion dans le total (cas a)", (() => { const r = R({ sens: "supplement", reglement: "a_regler", montantEuros: 150, engage: false, total: 380 }); return r.ok && r.mode === null && r.nouveauTotal === 530 && r.montant === 150; })());
check("à régler + engagé → supplément séparé a_regler (cas b)", (() => { const r = R({ sens: "supplement", reglement: "a_regler", montantEuros: 150, engage: true, total: 380 }); return r.ok && r.mode === "a_regler" && r.nouveauTotal === null; })());
check("à régler mais montant 0 → refusé", (() => { const r = R({ sens: "supplement", reglement: "a_regler", montantEuros: 0, engage: false, total: 380 }); return !r.ok; })());
check("offert → mode offert, 0 €, total inchangé", (() => { const r = R({ sens: "supplement", reglement: "offert", montantEuros: 150, engage: false, total: 380 }); return r.ok && r.mode === "offert" && r.montant === 0 && r.nouveauTotal === null; })());
// FAIL-CLOSED : l'option retirée et toute valeur inconnue sont REFUSÉES.
check("« réglé sur place en espèces » (especes_sur_place) → REFUSÉ (400)", !R({ sens: "supplement", reglement: "especes_sur_place", montantEuros: 150, engage: true, total: 380 }).ok);
check("valeur inconnue → refusée", !R({ sens: "supplement", reglement: "n_importe_quoi", montantEuros: 150, engage: false, total: 380 }).ok);
check("supplément sans règlement → refusé", !R({ sens: "supplement", reglement: null, montantEuros: 150, engage: false, total: 380 }).ok);
// Remboursement (inchangé) : fusion si non engagé, séparé sinon.
check("remboursement + non engagé → baisse du total (fusion)", (() => { const r = R({ sens: "remboursement", reglement: "remboursement_carte", montantEuros: 50, engage: false, total: 380 }); return r.ok && r.mode === null && r.nouveauTotal === 330 && r.montant === -50; })());
check("remboursement + engagé carte → remboursement_carte séparé", (() => { const r = R({ sens: "remboursement", reglement: "remboursement_carte", montantEuros: 50, engage: true, total: 380 }); return r.ok && r.mode === "remboursement_carte"; })());
check("remboursement montant 0 → refusé", !R({ sens: "remboursement", reglement: "remboursement_carte", montantEuros: 0, engage: true, total: 380 }).ok);
check("sens 'aucun' → changement de formule sans montant", (() => { const r = R({ sens: "aucun", montantEuros: 0, engage: false, total: 380 }); return r.ok && r.mode === null && r.montant === 0; })());

console.log("\n== Diff de disciplines : les 6 transitions (texte ajout/retrait réel) ==");
// Disciplines de chaque formule (déduites de la config, aucune liste en dur).
check("boxe = {Boxe française}", JSON.stringify(disciplinesDeFormule("boxe")) === JSON.stringify(["Boxe française"]));
check("boxe_prepa = {Boxe française, Préparation physique}", JSON.stringify(disciplinesDeFormule("boxe_prepa")) === JSON.stringify(["Boxe française", "Préparation physique"]));
check("savate_prepa = {Savate, Préparation physique}", JSON.stringify(disciplinesDeFormule("savate_prepa")) === JSON.stringify(["Savate", "Préparation physique"]));
const ph = (av: "boxe"|"boxe_prepa"|"savate_prepa", ap: "boxe"|"boxe_prepa"|"savate_prepa") => phrasesChangementDisciplines(diffDisciplines(av, ap)).join(" ");
// 1. boxe → boxe_prepa : gagne la prépa.
check("boxe→boxe_prepa : accès prépa, aucun retrait", ph("boxe", "boxe_prepa") === "Vous avez désormais accès aux cours de préparation physique.");
// 2. boxe_prepa → boxe : perd la prépa.
check("boxe_prepa→boxe : prépa retirée", ph("boxe_prepa", "boxe") === "Les cours de préparation physique ne font plus partie de votre formule.");
// 3. boxe → savate_prepa : gagne savate + prépa, perd boxe française.
check("boxe→savate_prepa : +savate +prépa, −boxe française", ph("boxe", "savate_prepa") === "Vous avez désormais accès aux cours de savate et préparation physique. Les cours de boxe française ne font plus partie de votre formule.");
// 4. savate_prepa → boxe : gagne boxe française, perd savate + prépa.
check("savate_prepa→boxe : +boxe française, −savate −prépa", ph("savate_prepa", "boxe") === "Vous avez désormais accès aux cours de boxe française. Les cours de savate et préparation physique ne font plus partie de votre formule.");
// 5. boxe_prepa → savate_prepa : gagne savate, perd boxe française (prépa conservée, non citée).
check("boxe_prepa→savate_prepa : +savate, −boxe française (prépa non citée)", ph("boxe_prepa", "savate_prepa") === "Vous avez désormais accès aux cours de savate. Les cours de boxe française ne font plus partie de votre formule.");
// 6. savate_prepa → boxe_prepa : LE BUG — gagne boxe française, perd savate (JAMAIS « accès prépa »).
check("savate_prepa→boxe_prepa : +boxe française, −savate (PAS « accès prépa »)", ph("savate_prepa", "boxe_prepa") === "Vous avez désormais accès aux cours de boxe française. Les cours de savate ne font plus partie de votre formule.");
check("savate_prepa→boxe_prepa : ne mentionne PAS la préparation physique", !ph("savate_prepa", "boxe_prepa").toLowerCase().includes("préparation physique"));

console.log("\n== Propagation : tout dérive de (package, option_prepa) ==");
// Avant : BF seule. Après : BF + Prépa (flip de option_prepa_physique).
const avant = { package: "boxe_classique" as const, option: false };
const apres = { package: "boxe_classique" as const, option: true };
// Filtre/segment/trombi/dashboard : formuleCle.
check("filtre formule : boxe → boxe_prepa", formuleCle(avant.package, avant.option) === "boxe" && formuleCle(apres.package, apres.option) === "boxe_prepa");
// Hors formule / « prévenir » / segments par discipline : adherentDansDiscipline.
check("prépa physique : non avant, OUI après", adherentDansDiscipline(avant.package, avant.option, "prepa_physique") === false && adherentDansDiscipline(apres.package, apres.option, "prepa_physique") === true);
check("boxe française : toujours incluse (même package)", adherentDansDiscipline(apres.package, apres.option, "boxe_francaise") === true);
// Retrait d'une formule : savate_prepa → boxe seule → disparaît de savate/prépa.
check("retrait savate+prépa → boxe : sort de savate", adherentDansDiscipline("boxe_classique", false, "savate") === false);
check("retrait savate+prépa → boxe : sort de prépa", adherentDansDiscipline("boxe_classique", false, "prepa_physique") === false);

console.log(`\nRésultat : ${ok} OK / ${ko} KO`);
process.exit(ko === 0 ? 0 : 1);
