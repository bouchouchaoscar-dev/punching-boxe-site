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
  | "mode_paiement"
  | "statut_paiement"
  | "nb_echeances"
  | "annule_at"
  | "montant_rembourse"
>;

// Échelle : gris (en attente, NON engagé) → orange (engagé X/N) → vert (payé)
// → rouge (échec) → ardoise (annulé / remboursé). « Engagé » = 1er paiement passé.
const GREEN = "bg-green-50 text-green-700";
const ORANGE = "bg-orange-50 text-orange-600";
const RED = "bg-red-50 text-red-700";
const GRAY = "bg-paper-2 text-smoke";
const SLATE = "bg-ink/10 text-ink"; // annulé / remboursé (distinct de "en attente")

/**
 * Libellé de statut de paiement adapté au mode + à l'engagement. Source unique
 * partagée par la liste ET la fiche (cohérence garantie). Priorités :
 * - annulé / remboursé          → « Remboursé » / « Annulé » (ardoise) — distinct de "En attente"
 * - échec                       → « Échec · à régulariser » (rouge)
 * - espèces                     → « Espèces confirmé » (vert) / « Espèces en attente » (gris)
 * - carte 1x                    → « Payé en ligne » (vert) / « En attente » (gris)
 * - carte fractionnée soldée    → « Payé en ligne N/N » (vert)
 * - carte fractionnée engagée   → « Engagé · X/N payé » (orange)  [1 ≤ X < N]
 * - carte fractionnée non payée → « En attente » (gris)           [X = 0]
 * `paidEcheances` = nombre d'échéances NUMÉROTÉES déjà payées.
 */
// Statut « de base » (mode + avancement), sans tenir compte du remboursement.
function baseStatut(
  a: PaiementInfo,
  paidEcheances: number,
): { label: string; cls: string } {
  if (a.statut_paiement === "echec_paiement")
    return { label: "❌ Échec · à régulariser", cls: RED };

  if (a.mode_paiement === "especes")
    return a.statut_paiement === "confirme_especes"
      ? { label: "✅ Espèces confirmé", cls: GREEN }
      : { label: "⏳ Espèces en attente", cls: GRAY };

  // Carte fractionnée (stripe_2x/3x/4x) → engagement + avancement X/N.
  if (a.mode_paiement !== "stripe_1x") {
    const n = a.nb_echeances || nbEcheances(a.mode_paiement);
    if (n > 1) {
      if (paidEcheances >= n)
        return { label: `✅ Payé en ligne ${n}/${n}`, cls: GREEN };
      if (paidEcheances >= 1)
        return { label: `🟠 Engagé · ${paidEcheances}/${n} payé`, cls: ORANGE };
      return { label: "⏳ En attente", cls: GRAY };
    }
  }

  // Carte 1x.
  return a.statut_paiement === "paye"
    ? { label: "✅ Payé en ligne", cls: GREEN }
    : { label: "⏳ En attente", cls: GRAY };
}

export function paiementStatut(
  a: PaiementInfo,
  paidEcheances: number,
): { label: string; cls: string } {
  // Dossier FERMÉ (annule_at posé = fin d'inscription) → statut plein « ardoise ».
  if (a.annule_at) {
    return (a.montant_rembourse ?? 0) > 0
      ? { label: "↩️ Fin d'inscription · remboursé", cls: SLATE }
      : { label: "⛔ Fin d'inscription", cls: SLATE };
  }

  // Remboursement avec dossier TOUJOURS ACTIF (pas de fermeture) : on garde le
  // statut « en cours » (couleur + X/N) et on mentionne le remboursement —
  // les prélèvements peuvent continuer.
  const base = baseStatut(a, paidEcheances);
  if ((a.montant_rembourse ?? 0) > 0) {
    return { label: `${base.label} · remboursé`, cls: base.cls };
  }
  return base;
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
