import { messageRemboursement } from "../lib/email";

// Matrice du mail de remboursement : canal × total/partiel × fermeture ×
// échéances futures. On vérifie surtout qu'on ne mentionne JAMAIS de
// prélèvements quand il n'y en avait pas (bug constaté : espèces 1x + clôture).

let ko = 0;
function check(nom: string, cond: boolean, detail?: unknown) {
  if (cond) console.log(`  ✓ ${nom}`);
  else {
    ko++;
    console.log(`  ✗ ${nom}`, detail ?? "");
  }
}

console.log("1) BUG visé : espèces, total, fermeture, AUCUNE échéance future");
{
  const m = messageRemboursement({
    montant: 250,
    canal: "especes",
    total: true,
    ferme: true,
    echeancesFutures: 0,
  });
  check("ne parle PAS de prélèvements", !/prélèvement/i.test(m.ligneSituation), m.ligneSituation);
  check("mentionne la fin d'inscription", /inscription prend fin/i.test(m.ligneSituation));
  check("montant en espèces", /en espèces/.test(m.ligneMontant), m.ligneMontant);
  check("wording total", /intégralité/.test(m.ligneMontant));
  check("sujet fermeture", m.subject === "Remboursement et fin de votre inscription");
}

console.log("\n2) Cas qui marche déjà : carte, partiel, SANS fermeture, fractionné");
{
  const m = messageRemboursement({
    montant: 100,
    canal: "stripe",
    total: false,
    ferme: false,
    echeancesFutures: 2,
  });
  check("prélèvements se poursuivent", /se poursuivent normalement/.test(m.ligneSituation), m.ligneSituation);
  check("sur votre carte bancaire", /sur votre carte bancaire/.test(m.ligneMontant), m.ligneMontant);
  check("wording partiel (pas 'intégralité')", !/intégralité/.test(m.ligneMontant));
  check("sujet standard", m.subject === "Confirmation de votre remboursement");
}

console.log("\n3) Carte, total, fermeture, AVEC échéances futures (fractionné stoppé)");
{
  const m = messageRemboursement({
    montant: 432,
    canal: "stripe",
    total: true,
    ferme: true,
    echeancesFutures: 2,
  });
  check("prélèvements à venir arrêtés + fin", /à venir sont arrêtés et votre inscription prend fin/.test(m.ligneSituation), m.ligneSituation);
}

console.log("\n4) Carte, partiel, 1 fois (comptant), SANS fermeture → aucune ligne situation");
{
  const m = messageRemboursement({
    montant: 50,
    canal: "stripe",
    total: false,
    ferme: false,
    echeancesFutures: 0,
  });
  check("aucune ligne situation", m.ligneSituation === "", m.ligneSituation);
}

console.log("\n5) Virement, total, fermeture, sans échéance");
{
  const m = messageRemboursement({
    montant: 300,
    canal: "virement",
    total: true,
    ferme: true,
    echeancesFutures: 0,
  });
  check("par virement", /par virement/.test(m.ligneMontant), m.ligneMontant);
  check("fin sans prélèvements", m.ligneSituation === "Votre inscription prend fin.", m.ligneSituation);
}

console.log(ko === 0 ? "\nRésultat : TOUS OK" : `\nRésultat : ${ko} ÉCHEC(S)`);
process.exit(ko === 0 ? 0 : 1);
