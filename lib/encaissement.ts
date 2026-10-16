// SOURCE UNIQUE du « reste à encaisser » (fractionné) : somme des échéances
// PLANIFIÉES non encore payées, par adhérent. Calcul DYNAMIQUE à partir des
// lignes `paiements` — rien n'est stocké : dès qu'une échéance passe à 'paye',
// elle sort mécaniquement de ce total (elle rejoint l'encaissé).
//
// CHOIX ACTÉ : on ne somme QUE `statut === 'en_attente'` (argent quasi-certain
// planifié). On EXCLUT 'paye' (déjà encaissé) ET 'echec' (dû mais incertain,
// déjà signalé par le statut échec). `numero_echeance != null` exclut
// l'encaissement espèces global. Le total de la carte ET la liste de l'infobulle
// dérivent de ce même helper → zéro divergence.
export type EcheanceRow = {
  adherent_id: string;
  montant: number | string | null;
  statut: string | null;
  numero_echeance: number | null;
};

export function resteParAdherent(rows: EcheanceRow[]): Map<string, number> {
  const m = new Map<string, number>();
  for (const r of rows) {
    if (r.numero_echeance == null) continue; // exclut l'encaissement espèces global
    if (r.statut !== "en_attente") continue; // planifié non payé UNIQUEMENT
    m.set(r.adherent_id, (m.get(r.adherent_id) ?? 0) + Number(r.montant || 0));
  }
  return m;
}

const round2 = (n: number) => Math.round(n * 100) / 100;

// [020] ENCAISSEMENT ESPÈCES en plusieurs fois — helpers PURS (sans I/O).
// Un versement espèces = ligne `paiements` : numero_echeance null, SANS
// PaymentIntent, statut 'paye'. Le total encaissé se CALCULE depuis ces lignes.
export type VersementRow = {
  montant: number | string | null;
  statut: string | null;
  numero_echeance: number | null;
  stripe_payment_intent_id?: string | null;
  changement_id?: string | null;
};

// Une ligne est-elle un versement ESPÈCES encaissé ? (numéro null, sans carte, payé)
export function estVersementEspeces(r: VersementRow): boolean {
  return r.numero_echeance == null && !r.stripe_payment_intent_id && r.statut === "paye";
}

// Total encaissé en espèces pour une CIBLE (cotisation : changement_id null, hors
// lignes rattachées à un supplément ; supplément : changement_id == cibleId).
export function totalEncaisseEspeces(
  rows: VersementRow[],
  cible: { changementId: string | null; exclureIds?: Set<string> },
): number {
  let total = 0;
  for (const r of rows) {
    if (!estVersementEspeces(r)) continue;
    const chg = r.changement_id ?? null;
    if (cible.changementId === null) {
      if (chg !== null) continue; // rattaché à un supplément → pas la cotisation
    } else if (chg !== cible.changementId) {
      continue;
    }
    total += Number(r.montant || 0);
  }
  return round2(total);
}

// Reste dû (jamais négatif), arrondi au centime.
export function resteDuEspeces(duEuros: number, encaisseEuros: number): number {
  return round2(Math.max(0, Number(duEuros || 0) - Number(encaisseEuros || 0)));
}

// Un montant de versement est-il acceptable ? (strictement positif, ≤ reste dû).
// Comparaison en CENTIMES (évite les artefacts flottants). Le serveur a le dernier mot.
export function versementValide(montantEuros: number, resteDuEuros: number): boolean {
  const c = Math.round(Number(montantEuros || 0) * 100);
  const reste = Math.round(Number(resteDuEuros || 0) * 100);
  return c > 0 && c <= reste;
}
