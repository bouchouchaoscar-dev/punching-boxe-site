// Typographie française : espace insécable avant la ponctuation double
// (! ? : ;) et à l'intérieur des guillemets « … ». Évite qu'un « ! » ou « ? »
// passe seul à la ligne.   = espace insécable (OK en HTML et en JSX).
const NBSP = " ";
export function fr(s: string): string {
  return (s ?? "")
    .replace(/\s*([!?:;])/g, `${NBSP}$1`)
    .replace(/«\s*/g, `«${NBSP}`)
    .replace(/\s*»/g, `${NBSP}»`);
}
