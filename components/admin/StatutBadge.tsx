import type { StatutPaiement } from "@/lib/types";

const MAP: Record<StatutPaiement, { label: string; cls: string }> = {
  paye: { label: "✅ Payé en ligne", cls: "bg-green-50 text-green-700" },
  confirme_especes: {
    label: "✅ Espèces confirmé",
    cls: "bg-green-50 text-green-700",
  },
  en_attente: { label: "⏳ En attente", cls: "bg-orange-50 text-orange-600" },
};

export function StatutBadge({ statut }: { statut: StatutPaiement }) {
  const m = MAP[statut] ?? MAP.en_attente;
  return (
    <span
      className={`inline-flex whitespace-nowrap rounded-full px-2.5 py-1 text-xs font-bold ${m.cls}`}
    >
      {m.label}
    </span>
  );
}
