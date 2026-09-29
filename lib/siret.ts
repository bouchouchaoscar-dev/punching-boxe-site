// SIRET — formatage lisible + contrôle de validité (clé de Luhn). Source unique.
// SIRET = SIREN (9 chiffres) + NIC (5 chiffres) = 14 chiffres.

/** Ne garde que les chiffres. */
function chiffres(s: string): string {
  return (s ?? "").replace(/\D/g, "");
}

/**
 * Affichage lisible : SIREN en 3 groupes de 3 + NIC de 5.
 * Ex. "44793778000032" → "447 937 780 00032".
 * Entrée non conforme (≠ 14 chiffres) : renvoie la saisie nettoyée telle quelle
 * (l'affichage ne casse jamais ; c'est un TEST qui rejette un SIRET invalide).
 */
export function formatSiret(siret: string): string {
  const d = chiffres(siret);
  if (d.length !== 14) return d;
  return `${d.slice(0, 3)} ${d.slice(3, 6)} ${d.slice(6, 9)} ${d.slice(9, 14)}`;
}

/**
 * Lignes de mentions légales pour le pied de page des documents de paiement.
 * "SIRET …" d'abord, puis RNA / Agrément sport / Affiliation fédérale si
 * renseignés, joints par " · " ; passe à une 2e ligne au-delà de `maxParLigne`
 * caractères. Champs vides = ignorés. Aucun champ → tableau vide.
 */
export function lignesMentionsLegales(
  legal: { siret?: string; rna?: string; agrementSport?: string; affiliationFederale?: string },
  maxParLigne = 52,
): string[] {
  const parts: string[] = [];
  if (legal.siret && chiffres(legal.siret).length > 0) parts.push(`SIRET ${formatSiret(legal.siret)}`);
  if (legal.rna?.trim()) parts.push(`RNA ${legal.rna.trim()}`);
  if (legal.agrementSport?.trim()) parts.push(`Agrément sport n° ${legal.agrementSport.trim()}`);
  if (legal.affiliationFederale?.trim()) parts.push(legal.affiliationFederale.trim());

  const lignes: string[] = [];
  let cur = "";
  for (const p of parts) {
    if (!cur) cur = p;
    else if ((cur + " · " + p).length <= maxParLigne) cur += ` · ${p}`;
    else {
      lignes.push(cur);
      cur = p;
    }
  }
  if (cur) lignes.push(cur);
  return lignes;
}

/** Validité par clé de Luhn (14 chiffres). */
export function siretValide(siret: string): boolean {
  const d = chiffres(siret);
  if (d.length !== 14) return false;
  let somme = 0;
  // Luhn : en partant de la droite, on double un chiffre sur deux.
  for (let i = 0; i < 14; i++) {
    let n = d.charCodeAt(13 - i) - 48; // chiffre depuis la droite
    if (i % 2 === 1) {
      n *= 2;
      if (n > 9) n -= 9;
    }
    somme += n;
  }
  return somme % 10 === 0;
}
