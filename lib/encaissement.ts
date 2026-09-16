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
