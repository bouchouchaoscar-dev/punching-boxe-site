// Formatage d'AFFICHAGE des numéros de téléphone (FR). Ne modifie jamais la
// donnée stockée — uniquement la présentation. Module PUR (client + serveur).
//
// Règles :
// - retire espaces / points / tirets ;
// - 9 chiffres sans 0 initial (ex. "660520945") → ajoute le 0 → "0660520945" ;
// - 10 chiffres commençant par 0 → conservé ;
// - groupage par paires → "06 60 52 09 45" ;
// - vide → "" ; format inattendu (international +33…, longueur autre) →
//   renvoyé tel quel (jamais de formatage faux).
export function formatTelephone(raw?: string | null): string {
  if (!raw) return "";
  const brut = String(raw).trim();
  if (!brut) return "";

  // Ne garde que les chiffres (retire espaces, points, tirets, parenthèses…).
  let n = brut.replace(/[\s.\-()]/g, "");

  // 9 chiffres sans 0 initial → on rétablit le 0 (ex. "660520945").
  if (/^\d{9}$/.test(n) && !n.startsWith("0")) n = `0${n}`;

  // Numéro français standard à 10 chiffres commençant par 0 → groupage paires.
  if (/^0\d{9}$/.test(n)) {
    return n.match(/.{1,2}/g)!.join(" ");
  }

  // Tout le reste (international, longueur inattendue, valeur non numérique) :
  // renvoyé tel quel, sans planter ni imposer un format erroné.
  return brut;
}
