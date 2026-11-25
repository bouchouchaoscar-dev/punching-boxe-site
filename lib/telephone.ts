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

// Téléphone français (mobile ou fixe) : validation + normalisation E.164. PUR,
// sans I/O. Accepte les saisies courantes (espaces, points, tirets, parenthèses,
// préfixe 0, +33 ou 0033) et renvoie `+33XXXXXXXXX` (9 chiffres après +33) ou null
// si le numéro n'est pas un numéro français valide. Le serveur fait foi.
export function normaliserTelephoneFr(input: string | null | undefined): string | null {
  if (!input) return null;
  // Ne garder que les chiffres et un éventuel « + » de tête.
  const brut = String(input).trim().replace(/[\s.\-() ]/g, "");
  let digits: string;
  if (brut.startsWith("+33")) digits = "0" + brut.slice(3);
  else if (brut.startsWith("0033")) digits = "0" + brut.slice(4);
  else if (brut.startsWith("33") && brut.length === 11) digits = "0" + brut.slice(2);
  else digits = brut;
  // Format national attendu : 0 suivi de 9 chiffres, 2e chiffre 1..9 (01-09).
  if (!/^0[1-9]\d{8}$/.test(digits)) return null;
  return "+33" + digits.slice(1);
}

// Numéro valide ? (helper booléen pour la validation serveur.)
export function telephoneFrValide(input: string | null | undefined): boolean {
  return normaliserTelephoneFr(input) !== null;
}

// Affichage FR lisible à partir d'un E.164 (+33… → 0X XX XX XX XX). Tolérant :
// renvoie l'entrée telle quelle si ce n'est pas un +33 attendu.
export function formaterTelephoneFr(e164: string | null | undefined): string {
  if (!e164) return "";
  const m = /^\+33([1-9]\d{8})$/.exec(e164);
  if (!m) return e164;
  const n = "0" + m[1];
  return n.replace(/(\d{2})(?=\d)/g, "$1 ").trim();
}
