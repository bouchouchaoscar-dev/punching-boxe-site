// Saison sportive du club. Format "AAAA-AAAA" (ex. "2026-2027").
// Module PUR (aucun import serveur) → utilisable côté client et serveur.
//
// Règle d'attribution par défaut selon la date :
// - sept → déc : saison EN COURS  (`${y}-${y+1}`)
// - janv → mai : saison EN COURS  (`${y-1}-${y}`)
// - juin → août : saison SUIVANTE (`${y}-${y+1}`) — inscriptions anticipées

export function saisonCourante(date: Date): string {
  const m = date.getMonth(); // 0 = janvier … 11 = décembre
  const y = date.getFullYear();
  if (m >= 8) return `${y}-${y + 1}`; // sept–déc
  if (m <= 4) return `${y - 1}-${y}`; // janv–mai
  return `${y}-${y + 1}`; // juin–août (saison suivante)
}

// La bascule "saison en cours" n'est proposée qu'en JUIN (dernier mois de la
// saison qui se termine le 30 juin). En juillet/août elle est déjà terminée.
export function estJuin(date: Date): boolean {
  return date.getMonth() === 5;
}

// Saison qui se termine (alternative proposée en juin) : `${y-1}-${y}`.
export function saisonQuiSeTermine(date: Date): string {
  const y = date.getFullYear();
  return `${y - 1}-${y}`;
}
