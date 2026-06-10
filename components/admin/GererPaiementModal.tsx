"use client";

import { useMemo, useState } from "react";
import { adminAuthHeaders } from "@/lib/admin-auth";
import { euro } from "@/lib/pricing";
import type { Adherent, Paiement } from "@/lib/types";

// Panneau « Gérer le paiement » : découple le REMBOURSEMENT (montant, carte ou
// espèces) du STATUT (fin d'inscription ou non). Le serveur reste autoritaire.
export function GererPaiementModal({
  adherent,
  paiements,
  onClose,
  onDone,
}: {
  adherent: Adherent;
  paiements: Paiement[];
  onClose: () => void;
  onDone: (msg: string) => void;
}) {
  const { paye, dejaRembourse, encaisse, remboursable, canal, nbFutures } =
    useMemo(() => {
      // Lignes réellement encaissées (payées ou partiellement remboursées).
      const collectees = paiements.filter(
        (p) => p.statut === "paye" || p.statut === "rembourse",
      );
      const stripeRows = collectees.filter((p) => p.stripe_payment_intent_id);
      const especesRows = collectees.filter((p) => !p.stripe_payment_intent_id);
      const canal: "stripe" | "especes" =
        stripeRows.length > 0 ? "stripe" : "especes";
      const rows = canal === "stripe" ? stripeRows : especesRows;

      const sum = (xs: Paiement[], f: (p: Paiement) => number) =>
        Math.round(xs.reduce((s, p) => s + f(p), 0) * 100) / 100;
      const m = (p: Paiement) => Number(p.montant || 0);
      const r = (p: Paiement) => Number(p.montant_rembourse || 0);

      return {
        paye: sum(collectees, m),
        dejaRembourse: sum(collectees, r),
        encaisse: sum(collectees, (p) => m(p) - r(p)),
        remboursable: sum(rows, (p) => Math.max(0, m(p) - r(p))),
        canal,
        nbFutures: paiements.filter(
          (p) =>
            p.numero_echeance != null &&
            (p.statut === "en_attente" ||
              p.statut === "en_cours" ||
              p.statut === "echec"),
        ).length,
      };
    }, [paiements]);

  const [step, setStep] = useState<"choix" | "confirm">("choix");
  const [montantStr, setMontantStr] = useState("");
  const [fermer, setFermer] = useState(false); // par défaut : ne PAS fermer
  const [actionId, setActionId] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");

  const montant =
    Math.round((parseFloat(montantStr.replace(",", ".")) || 0) * 100) / 100;
  const montantTropGrand =
    montant > 0 && Math.round(montant * 100) > Math.round(remboursable * 100);
  const rienAFaire = montant <= 0 && !fermer;
  const canalLabel = canal === "stripe" ? "carte" : "espèces";

  function continuer() {
    setError("");
    if (montantTropGrand) {
      setError(`Maximum remboursable : ${euro(remboursable)}.`);
      return;
    }
    if (rienAFaire) {
      setError("Indique un montant à rembourser et/ou coche « fin d'inscription ».");
      return;
    }
    setActionId(crypto.randomUUID());
    setStep("confirm");
  }

  async function confirmer() {
    setSending(true);
    setError("");
    try {
      const res = await fetch(`/api/admin/adherents/${adherent.id}/gerer-paiement`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...adminAuthHeaders() },
        body: JSON.stringify({ actionId, montant, fermer, canal }),
      });
      const d = await res.json().catch(() => ({}));
      if (res.ok && d.success) {
        const parts: string[] = [];
        if (d.montantRembourse > 0)
          parts.push(`Remboursé ${euro(d.montantRembourse)} (${canalLabel})`);
        if (d.ferme) parts.push("inscription fermée");
        onDone(parts.join(" · ") || "Opération effectuée");
      } else if (res.ok && d.dejaTraite) {
        onDone("Action déjà traitée (aucun double remboursement)");
      } else {
        setError(d.error || "Échec de l'opération.");
      }
    } catch {
      setError("Erreur réseau.");
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-ink/40 p-4">
      <div className="max-h-[92vh] w-full max-w-lg overflow-y-auto rounded-[1.5rem] bg-white p-6">
        <div className="flex items-start justify-between gap-4">
          <h2 className="font-display text-xl font-extrabold uppercase text-ink">
            Gérer le paiement
          </h2>
          <button
            onClick={onClose}
            className="shrink-0 text-2xl leading-none text-smoke hover:text-ink"
            aria-label="Fermer"
          >
            ×
          </button>
        </div>
        <p className="mt-1 text-sm text-smoke">
          {adherent.prenom} {adherent.nom} ·{" "}
          <span className="font-semibold text-ink">Paiement {canalLabel}</span>
        </p>

        {/* Récap chiffré : Payé · Remboursé · Encaissé (net) */}
        <div className="mt-4 grid grid-cols-3 gap-2 text-center">
          <Box label="Payé" value={euro(paye)} />
          <Box label="Remboursé" value={euro(dejaRembourse)} />
          <Box label="Encaissé" value={euro(encaisse)} accent />
        </div>

        {step === "choix" ? (
          <div className="mt-5 space-y-4">
            {/* Montant à rembourser */}
            <div>
              <span className="mb-1 block text-sm font-semibold text-ink">
                Montant à rembourser{" "}
                <span className="font-normal text-smoke">
                  (max {euro(remboursable)} · {canalLabel} · 0 = aucun)
                </span>
              </span>
              <div className="flex items-center gap-2">
                <input
                  inputMode="decimal"
                  value={montantStr}
                  onChange={(e) => setMontantStr(e.target.value)}
                  placeholder="0"
                  className="focus-ring w-40 rounded-xl border border-line bg-paper-2 px-3 py-2 text-sm outline-none focus:border-orange"
                />
                <span className="text-sm text-smoke">€</span>
                {remboursable > 0 && (
                  <button
                    type="button"
                    onClick={() => setMontantStr(String(remboursable))}
                    className="rounded-lg border border-line px-2.5 py-1 text-xs font-semibold text-ink hover:border-orange hover:text-orange"
                  >
                    Tout ({euro(remboursable)})
                  </button>
                )}
              </div>
            </div>

            {/* Question fin d'inscription (découplée du montant) */}
            <div className="rounded-xl border border-line p-3">
              <span className="block text-sm font-semibold text-ink">
                Ce remboursement met-il fin à l&apos;inscription ?
              </span>
              <div className="mt-2 flex gap-2">
                <ChoiceBtn active={!fermer} onClick={() => setFermer(false)}>
                  Non — reste adhérent
                </ChoiceBtn>
                <ChoiceBtn active={fermer} onClick={() => setFermer(true)}>
                  Oui — fin d&apos;inscription
                </ChoiceBtn>
              </div>
              <p className="mt-2 text-xs text-smoke">
                {fermer
                  ? `Le dossier sera fermé : sort des actifs et des relances${nbFutures > 0 ? `, ${nbFutures} échéance(s) à venir stoppée(s)` : ""}.`
                  : "Le dossier reste actif, les échéances à venir continuent. On enregistre juste le remboursement."}
              </p>
            </div>

            {error && <p className="text-sm font-semibold text-red-600">{error}</p>}

            <div className="flex items-center justify-end gap-3 pt-1">
              <button onClick={onClose} className="text-sm font-semibold text-smoke hover:text-ink">
                Annuler
              </button>
              <button
                onClick={continuer}
                className="rounded-full bg-orange px-5 py-2.5 text-sm font-bold text-white hover:bg-orange/90"
              >
                Continuer
              </button>
            </div>
          </div>
        ) : (
          <div className="mt-5">
            <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-800">
              <p className="font-bold">Action irréversible.</p>
              <p className="mt-1">
                {montant > 0
                  ? `Tu vas rembourser ${euro(montant)} en ${canalLabel}`
                  : "Aucun remboursement"}
                {fermer
                  ? ` et mettre fin à l'inscription${nbFutures > 0 ? ` (${nbFutures} échéance(s) stoppée(s))` : ""}.`
                  : ". L'adhérent reste actif (échéances conservées)."}
              </p>
            </div>
            {error && <p className="mt-3 text-sm font-semibold text-red-600">{error}</p>}
            <div className="mt-5 flex items-center justify-end gap-3">
              <button
                onClick={() => setStep("choix")}
                disabled={sending}
                className="text-sm font-semibold text-smoke hover:text-ink"
              >
                Retour
              </button>
              <button
                onClick={confirmer}
                disabled={sending}
                className="rounded-full bg-red-600 px-5 py-2.5 text-sm font-bold text-white transition-colors hover:bg-red-700 disabled:opacity-50"
              >
                {sending
                  ? "Traitement…"
                  : montant > 0
                    ? `Confirmer le remboursement de ${euro(montant)}`
                    : "Confirmer la fin d'inscription"}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function Box({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  return (
    <div className="rounded-xl border border-line bg-paper-2 p-3">
      <p className="text-[0.6rem] font-bold uppercase tracking-wide text-smoke">{label}</p>
      <p className={`font-display mt-1 text-base font-black ${accent ? "text-orange" : "text-ink"}`}>{value}</p>
    </div>
  );
}

function ChoiceBtn({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex-1 rounded-xl border px-3 py-2 text-sm font-semibold transition-colors ${
        active ? "border-orange bg-orange-50 text-orange" : "border-line text-ink hover:border-orange/40"
      }`}
    >
      {children}
    </button>
  );
}
