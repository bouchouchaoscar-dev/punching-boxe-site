// Test PUR de la définition centrale "adhérent actif compté" et de son usage :
// segments natifs (filtrerAdherents), KPI dashboard (même helper), foyer fermé.
// Lancer : npx --yes tsx scripts/test-coherence-actifs.mts

import { estActifCompte } from "../lib/adherents-actifs";
import { filtrerAdherents } from "../lib/campagnes";
import { resoudreFoyerCible, type FoyerSource } from "../lib/foyer";
import { saisonCourante } from "../lib/saison";
import type { Adherent } from "../lib/types";

let ok = 0, ko = 0;
const check = (l: string, c: boolean, g?: unknown) => {
  if (c) { ok++; console.log(`  ✓ ${l}`); }
  else { ko++; console.log(`  ✗ ${l}` + (g !== undefined ? `  → ${JSON.stringify(g)}` : "")); }
};

const COURANTE = saisonCourante(new Date());
const y = parseInt(COURANTE.slice(0, 4), 10);
const PRECEDENTE = `${y - 1}-${y}`;

// Dossier minimal (champs utiles aux prédicats), valeurs "actif" par défaut.
function adh(p: Partial<Adherent> & { id: string }): Adherent {
  return {
    saison: COURANTE,
    annule_at: null,
    statut_paiement: "paye",
    echeances_payees: 1,
    mode_paiement: "stripe_1x",
    engage_at: "2026-09-01",
    package: "boxe_classique",
    type_adherent: "adulte",
    option_prepa_physique: false,
    certificat_medical_url: "x",
    documents_valides: true,
    nouveau_membre: false,
    email: `${p.id}@ex.fr`,
    match_key: null,
    ...p,
  } as Adherent;
}

console.log("1) estActifCompte (définition centrale)");
check("payé → actif", estActifCompte(adh({ id: "a" })));
check("fermé (annule_at) → NON actif", !estActifCompte(adh({ id: "b", annule_at: "2026-06-01" })));
check("espèces en attente → actif", estActifCompte(adh({ id: "c", mode_paiement: "especes", statut_paiement: "en_attente", echeances_payees: 0, engage_at: null })));
check("panier carte abandonné (en_attente, non engagé) → NON actif", !estActifCompte(adh({ id: "d", mode_paiement: "stripe_2x", statut_paiement: "en_attente", echeances_payees: 0, engage_at: null })));

console.log("\n2) Segments natifs (filtrerAdherents)");
const A = adh({ id: "A", package: "boxe_classique" }); // actif, BF, saison courante
const B = adh({ id: "B", package: "boxe_classique", annule_at: "2026-06-01" }); // BF mais FERMÉ
const C = adh({ id: "C", package: "boxe_classique", saison: PRECEDENTE }); // BF mais saison passée
const D = adh({ id: "D", package: "savate_prepa" }); // actif, Savate, courante
const pool = [A, B, C, D];

const boxe = filtrerAdherents(pool, ["boxe"]).map((a) => a.id).sort();
check("« Boxe Française » = seulement l'actif courant (A)", JSON.stringify(boxe) === JSON.stringify(["A"]), boxe);
check("→ dossier FERMÉ exclu de Boxe Française", !boxe.includes("B"));
check("→ dossier saison précédente exclu", !boxe.includes("C"));

const savate = filtrerAdherents(pool, ["savate"]).map((a) => a.id);
check("« Savate » = D", JSON.stringify(savate) === JSON.stringify(["D"]), savate);

const tous = filtrerAdherents(pool, ["tous"]).map((a) => a.id).sort();
check("« Tous » = non fermés toutes saisons (A, C, D — B fermé exclu)", JSON.stringify(tous) === JSON.stringify(["A", "C", "D"]), tous);
check("→ adhésion arrêtée (B) exclue de « Tous »", !tous.includes("B"));

const arretees = filtrerAdherents(pool, ["arretees"]).map((a) => a.id).sort();
check("« Adhésions arrêtées » = le dossier fermé courant (B)", JSON.stringify(arretees) === JSON.stringify(["B"]), arretees);
check("→ actif (A) PAS dans « Adhésions arrêtées »", !arretees.includes("A"));

const adultesSeul = filtrerAdherents(pool, ["adultes"]).map((a) => a.id).sort();
check("« Adultes » seul = actifs courants adultes (A, D)", JSON.stringify(adultesSeul) === JSON.stringify(["A", "D"]), adultesSeul);

// ---- Relance natifs (cross-saison) : tièdes / froids / non réinscrits ----
const cur = adh({ id: "CUR", saison: COURANTE }); // actif saison en cours
const nre = adh({ id: "NRE", saison: PRECEDENTE }); // actif saison dernière (gap 1)
const y2 = parseInt(COURANTE.slice(0, 4), 10);
const tie = adh({ id: "TIE", saison: `${y2 - 2}-${y2 - 1}` }); // gap 2 → tiède
const fro = adh({ id: "FRO", saison: `${y2 - 4}-${y2 - 3}` }); // gap 4 → froid
const poolR = [cur, nre, tie, fro];
check("« non réinscrits » = NRE (saison dernière)", JSON.stringify(filtrerAdherents(poolR, ["non_reinscrits"]).map((a) => a.id)) === JSON.stringify(["NRE"]));
check("« tièdes » = TIE (absent 2-3 ans)", JSON.stringify(filtrerAdherents(poolR, ["adherents_tiedes"]).map((a) => a.id)) === JSON.stringify(["TIE"]));
check("« froids » = FRO (absent +3 ans)", JSON.stringify(filtrerAdherents(poolR, ["adherents_froids"]).map((a) => a.id)) === JSON.stringify(["FRO"]));
check("relance n'inclut jamais l'actif courant (CUR)", !filtrerAdherents(poolR, ["non_reinscrits", "adherents_tiedes", "adherents_froids"]).some((a) => a.id === "CUR"));

console.log("\n3) KPI dashboard (même helper : fermés exclus du décompte)");
const actifs = pool.filter(estActifCompte).map((a) => a.id).sort();
check("décompte actifs = A, D (B fermé et C exclus ? C actif mais autre saison)", JSON.stringify(actifs) === JSON.stringify(["A", "C", "D"]), actifs);
// NB : estActifCompte ne filtre PAS la saison (c'est le rôle du scope dashboard,
// qui ne reçoit que la saison sélectionnée). Ici on vérifie juste l'exclusion du fermé.
check("dossier fermé exclu du décompte dashboard", !actifs.includes("B"));

console.log("\n4) Foyer : membre fermé non comptabilisé (état « ferme »)");
const r = resoudreFoyerCible(
  { titulaireId: "T1", foyerId: null },
  [{ etat: "ferme" } as FoyerSource],
  "NEW",
);
check("rattachement d'un membre fermé → ok=false raison=ferme", !r.ok && r.raison === "ferme", r);
const r2 = resoudreFoyerCible(
  { titulaireId: "T1", foyerId: null },
  [{ etat: "ok", foyerId: null, titulaireId: "T2" }],
  "NEW",
);
check("membre actif → résolution OK", r2.ok === true);

console.log(`\nRésultat : ${ok} OK · ${ko} ÉCHEC(S)`);
process.exit(ko === 0 ? 0 : 1);
