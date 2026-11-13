// Décalage des échéances d'un paiement fractionné (report à la demande de
// l'adhérent). Helpers PURS (sans I/O) : calcul de date « +N mois » (même jour,
// repli dernier jour du mois), éligibilité d'une échéance, validation serveur des
// nouvelles dates (jamais aujourd'hui/passé, ordre conservé), avertissement fin de
// saison. Tout le calcul de date est fait en composants calendaires (jamais
// d'instant) → indépendant du fuseau ; le « demain » Paris est fourni par l'appelant.

const pad = (n: number) => String(n).padStart(2, "0");

// Date « +N mois » en gardant le même jour du mois ; si ce jour n'existe pas dans
// le mois cible (ex. 31 janvier → février), on prend le DERNIER jour du mois.
export function decalerDateMois(iso: string, n: number): string {
  const [y, m, d] = iso.split("-").map(Number);
  const idx = (m - 1) + n; // index de mois 0-based cumulé
  const ty = y + Math.floor(idx / 12);
  const tm = ((idx % 12) + 12) % 12; // mois cible 0-based
  const dernierJour = new Date(ty, tm + 1, 0).getDate(); // jour 0 du mois suivant = dernier jour
  const td = Math.min(d, dernierJour);
  return `${ty}-${pad(tm + 1)}-${pad(td)}`;
}

// Une échéance est-elle DÉCALABLE (= non encaissée) ?
//  - 'echec' : échouée en attente de régularisation → oui (repassera « à venir ») ;
//  - 'en_attente' SANS PaymentIntent : à venir, jamais tentée → oui ;
//  - 'en_attente' AVEC PaymentIntent (prélèvement en vol), 'en_cours' (claim du
//    cron), 'paye', 'rembourse', 'annule', 'planifiee' → NON (on n'y touche jamais).
export function echeanceDecalable(p: {
  statut: string | null;
  numero_echeance: number | null;
  stripe_payment_intent_id: string | null;
}): boolean {
  if (p.numero_echeance == null) return false; // encaissement espèces, pas une échéance
  if (p.statut === "echec") return true;
  if (p.statut === "en_attente") return !p.stripe_payment_intent_id;
  return false;
}

export type NouvelleDate = { numero: number; iso: string };

// Validation SERVEUR des nouvelles dates (le serveur a le dernier mot) :
//  - au plus tôt DEMAIN (jamais aujourd'hui ni dans le passé → pas de prélèvement
//    immédiat par surprise) ;
//  - ordre des échéances conservé (la n°3 ne peut pas passer avant la n°2).
// Les dates ISO yyyy-mm-dd se comparent lexicographiquement = chronologiquement.
export function validerNouvellesDates(
  dates: NouvelleDate[],
  demainISO: string,
): { ok: true } | { ok: false; error: string } {
  const tri = [...dates].sort((a, b) => a.numero - b.numero);
  let prev = "";
  for (const e of tri) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(e.iso)) return { ok: false, error: `Date invalide pour le prélèvement ${e.numero}.` };
    if (e.iso < demainISO) return { ok: false, error: `La nouvelle date du prélèvement ${e.numero} doit être au plus tôt demain.` };
    if (prev && e.iso < prev) return { ok: false, error: `L'ordre des prélèvements doit être conservé (prélèvement ${e.numero}).` };
    prev = e.iso;
  }
  return { ok: true };
}

// Fin de la saison sportive (31 août de l'année de fin) pour une date de
// RÉFÉRENCE appartenant à la saison (ex. la date d'origine de l'échéance). Si le
// mois de référence est >= septembre, la saison finit le 31/08 de l'année
// suivante ; sinon le 31/08 de l'année courante. Sert à l'AVERTISSEMENT (non bloquant).
export function finSaisonISO(refISO: string): string {
  const [y, m] = refISO.split("-").map(Number);
  const anneeFin = m >= 9 ? y + 1 : y;
  return `${anneeFin}-08-31`;
}

// La nouvelle date dépasse-t-elle la fin de la saison de référence ? (avertissement)
export function depasseFinSaison(nouvelleISO: string, refISO: string): boolean {
  return nouvelleISO > finSaisonISO(refISO);
}
