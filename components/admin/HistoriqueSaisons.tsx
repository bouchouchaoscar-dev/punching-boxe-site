import { euro } from "@/lib/pricing";

export type HistLigne = {
  saison: string;
  disciplines: string[];
  montant: number | null;
  statut: "jeune" | "adulte" | "inconnu";
};

const STATUT_LABEL: Record<HistLigne["statut"], string> = {
  jeune: "Jeune",
  adulte: "Adulte",
  inconnu: "—",
};
const DISC_LABEL: Record<string, string> = {
  BF: "Boxe Française",
  SAVATE: "Savate",
  LES_2: "Les deux",
  AUTRE: "À vérifier",
};
const discList = (ds: string[]) =>
  ds.length ? ds.map((d) => DISC_LABEL[d] ?? d).join(", ") : "—";

/** Tableau historique des saisons (saison / discipline / statut / montant).
 * Visuel partagé entre l'onglet Anciens et la fiche d'un adhérent réinscrit. */
export function HistoriqueSaisons({ historique }: { historique: HistLigne[] }) {
  return (
    // Scroll horizontal propre : sur mobile, le tableau garde une largeur
    // minimale et défile au lieu d'être coupé à droite.
    <div className="mt-2 overflow-x-auto rounded-xl border border-line bg-white">
      <table className="w-full min-w-[30rem] text-left text-sm">
        <thead>
          <tr className="border-b border-line text-xs uppercase tracking-wide text-smoke">
            <th className="whitespace-nowrap px-3 py-2 font-bold">Saison</th>
            <th className="whitespace-nowrap px-3 py-2 font-bold">Discipline</th>
            <th className="whitespace-nowrap px-3 py-2 font-bold">Statut</th>
            <th className="whitespace-nowrap px-3 py-2 text-right font-bold">
              Montant
            </th>
          </tr>
        </thead>
        <tbody>
          {historique.map((h) => (
            <tr key={h.saison} className="border-b border-line last:border-0">
              <td className="whitespace-nowrap px-3 py-2 font-semibold text-ink">
                {h.saison}
              </td>
              <td className="whitespace-nowrap px-3 py-2 text-smoke">
                {discList(h.disciplines)}
              </td>
              <td className="whitespace-nowrap px-3 py-2 text-smoke">
                {STATUT_LABEL[h.statut]}
              </td>
              <td className="whitespace-nowrap px-3 py-2 text-right font-semibold text-ink">
                {h.montant == null ? "—" : euro(h.montant)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
