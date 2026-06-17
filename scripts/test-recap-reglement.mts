import {
  regrouperParEmail,
  remplacerVariables,
  type PersonneEnvoi,
} from "../lib/campagnes";
import { euro } from "../lib/pricing";

const E380 = euro(380);
const E250 = euro(250);
const E410 = euro(410);

// Variable {{recap_reglement}} : montant par personne, adaptatif single/famille.
let ko = 0;
const check = (nom: string, cond: boolean, detail?: unknown) => {
  if (cond) console.log(`  ✓ ${nom}`);
  else {
    ko++;
    console.log(`  ✗ ${nom}`, detail ?? "");
  }
};

const SAISON = "2026-2027";
const NONE = new Set<string>();

console.log("1) UN seul dossier (single)");
{
  const p: PersonneEnvoi[] = [
    {
      personKey: "natif:1",
      email: "solo@x.fr",
      prenom: "Marie",
      nom: "Durand",
      formule: "Boxe Française",
      montant: 380,
      saison: SAISON,
    },
  ];
  const { envois } = regrouperParEmail(p, NONE, SAISON);
  const recap = envois[0].vars.recap_reglement ?? "";
  check(
    "phrase simple avec montant + saison + formule",
    recap ===
      `Nous n'avons pas encore reçu votre règlement de ${E380} pour la saison 2026-2027 (Boxe Française).`,
    recap,
  );
  const html = remplacerVariables("Bonjour {{prenom}}, {{recap_reglement}}", envois[0].vars);
  check("substitution {{recap_reglement}}", html.includes(E380) && !html.includes("{{"), html);
}

console.log("\n2) PLUSIEURS dossiers même email (famille)");
{
  const p: PersonneEnvoi[] = [
    { personKey: "natif:1", email: "fam@x.fr", prenom: "Oscar", nom: "Bouchoucha", formule: "Boxe Française", montant: 380, saison: SAISON },
    { personKey: "natif:2", email: "fam@x.fr", prenom: "Léon", nom: "Bouchoucha", formule: "Savate & Prépa", montant: 250, saison: SAISON },
  ];
  const { envois } = regrouperParEmail(p, NONE, SAISON);
  const recap = envois[0].vars.recap_reglement ?? "";
  check("intro liste", recap.startsWith("Nous n'avons pas encore reçu les règlements suivants :"), recap);
  check("ligne Oscar", recap.includes(`- Oscar Bouchoucha : ${E380} (Boxe Française)`), recap);
  check("ligne Léon", recap.includes(`- Léon Bouchoucha : ${E250} (Savate & Prépa)`), recap);
  // {{montant}} simple reste vidé en multi (cohérent), mais recap couvre le besoin.
  check("{{montant}} simple vidé en famille", (envois[0].vars.montant ?? "") === "", envois[0].vars.montant);
}

console.log("\n3) Membre sans montant → ignoré du récap");
{
  const p: PersonneEnvoi[] = [
    { personKey: "natif:1", email: "m@x.fr", prenom: "Ana", nom: "K", formule: "Boxe Française", montant: 410, saison: SAISON },
    { personKey: "contact:9", email: "m@x.fr", prenom: "Sans", nom: "Montant", montant: null, saison: SAISON },
  ];
  const { envois } = regrouperParEmail(p, NONE, SAISON);
  const recap = envois[0].vars.recap_reglement ?? "";
  // 1 seul avec montant → phrase simple, pas de liste.
  check("retombe en phrase simple (1 montant réel)", recap.startsWith(`Nous n'avons pas encore reçu votre règlement de ${E410}`), recap);
}

console.log(ko === 0 ? "\nRésultat : TOUS OK" : `\nRésultat : ${ko} KO`);
process.exit(ko === 0 ? 0 : 1);
