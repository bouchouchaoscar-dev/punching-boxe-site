import type { Adherent, StatutPaiement } from "@/lib/types";
import { nbEcheances } from "@/lib/pricing";

const MAP: Record<StatutPaiement, { label: string; cls: string }> = {
  paye: { label: "✅ Payé en ligne", cls: "bg-green-50 text-green-700" },
  confirme_especes: {
    label: "✅ Espèces confirmé",
    cls: "bg-green-50 text-green-700",
  },
  en_attente: { label: "⏳ En attente", cls: "bg-orange-50 text-orange-600" },
  echec_paiement: { label: "❌ Échec paiement", cls: "bg-red-50 text-red-700" },
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

// ---- Statut "intelligent" selon le mode de règlement + l'avancement ----
type PaiementInfo = Pick<
  Adherent,
  "mode_paiement" | "statut_paiement" | "nb_echeances"
>;

const GREEN = "bg-green-50 text-green-700";
const ORANGE = "bg-orange-50 text-orange-600";
const RED = "bg-red-50 text-red-700";

/**
 * Libellé de statut de paiement adapté au mode :
 * - espèces  : « Espèces confirmé » / « Espèces en attente »
 * - carte 1x : « Payé en ligne » / « En attente »
 * - carte fractionnée : avancement « X/N payé » (X = échéances payées),
 *   « Payé en ligne » quand soldé (X = N).
 * `paidEcheances` = nombre d'échéances NUMÉROTÉES déjà payées.
 */
export function paiementStatut(
  a: PaiementInfo,
  paidEcheances: number,
): { label: string; cls: string } {
  if (a.statut_paiement === "echec_paiement")
    return { label: "❌ Échec paiement", cls: RED };

  if (a.mode_paiement === "especes")
    return a.statut_paiement === "confirme_especes"
      ? { label: "✅ Espèces confirmé", cls: GREEN }
      : { label: "⏳ Espèces en attente", cls: ORANGE };

  // Carte fractionnée (stripe_2x/3x/4x) → avancement X/N.
  if (a.mode_paiement !== "stripe_1x") {
    const n = a.nb_echeances || nbEcheances(a.mode_paiement);
    if (n > 1) {
      return paidEcheances >= n
        ? { label: "✅ Payé en ligne", cls: GREEN }
        : { label: `${paidEcheances}/${n} payé`, cls: ORANGE };
    }
  }

  // Carte 1x.
  return a.statut_paiement === "paye"
    ? { label: "✅ Payé en ligne", cls: GREEN }
    : { label: "⏳ En attente", cls: ORANGE };
}

export function PaiementStatut({
  adherent,
  paidEcheances,
}: {
  adherent: PaiementInfo;
  paidEcheances: number;
}) {
  const m = paiementStatut(adherent, paidEcheances);
  return (
    <span
      className={`inline-flex whitespace-nowrap rounded-full px-2.5 py-1 text-xs font-bold ${m.cls}`}
    >
      {m.label}
    </span>
  );
}
