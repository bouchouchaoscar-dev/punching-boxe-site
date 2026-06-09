"use client";

import { useMemo, useState } from "react";
import { adminAuthHeaders } from "@/lib/admin-auth";
import { euro } from "@/lib/pricing";
import type { Adherent, Paiement } from "@/lib/types";

type Mode = "refund_keep" | "refund_stop" | "refund_all" | "stop_only";

// Panneau « Gérer le paiement » : remboursement (montant libre / intégral) et/ou
// arrêt des prélèvements. Le serveur reste autoritaire (plafond, idempotence).
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
  const { encaisse, dejaRembourse, remboursable, nbFutures } = useMemo(() => {
    const payees = paiements.filter(
      (p) => p.statut === "paye" && p.stripe_payment_intent_id,
    );
    const enc = payees.reduce((s, p) => s + Number(p.montant || 0), 0);
    const rb = payees.reduce((s, p) => s + Number(p.montant_rembourse || 0), 0);
    const remb = payees.reduce(
      (s, p) => s + Math.max(0, Number(p.montant || 0) - Number(p.montant_rembourse || 0)),
      0,
    );
    const fut = paiements.filter(
      (p) =>
        p.numero_echeance != null &&
        (p.statut === "en_attente" || p.statut === "en_cours" || p.statut === "echec"),
    ).length;
    return {
      encaisse: Math.round(enc * 100) / 100,
      dejaRembourse: Math.round(rb * 100) / 100,
      remboursable: Math.round(remb * 100) / 100,
      nbFutures: fut,
    };
  }, [paiements]);

  const especes = adherent.mode_paiement === "especes";
  const peutRembourser = remboursable > 0 && !especes;

  const [step, setStep] = useState<"choix" | "confirm">("choix");
  const [mode, setMode] = useState<Mode>(peutRembourser ? "refund_keep" : "stop_only");
  const [montantStr, setMontantStr] = useState("");
  const [actionId, setActionId] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");

  const montantSaisi = Math.round(parseFloat(montantStr.replace(",", ".")) * 100) / 100;
  const montantEffectif =
    mode === "refund_all" ? remboursable : mode === "stop_only" ? 0 : montantSaisi || 0;

  const montantValide =
    mode === "stop_only" ||
    mode === "refund_all" ||
    (montantSaisi > 0 && Math.round(montantSaisi * 100) <= Math.round(remboursable * 100));

  function continuer() {
    setError("");
    if (!montantValide) {
      setError(
        montantSaisi > 0
          ? `Maximum remboursable : ${euro(remboursable)}.`
          : "Saisis un montant à rembourser.",
      );
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
        body: JSON.stringify({
          actionId,
          mode,
          ...(mode === "refund_keep" || mode === "refund_stop"
            ? { montant: montantSaisi }
            : {}),
        }),
      });
      const d = await res.json().catch(() => ({}));
      if (res.ok && d.success) {
        const parts: string[] = [];
        if (d.montantRembourse > 0) parts.push(`Remboursé ${euro(d.montantRembourse)}`);
        if (d.echeancesAnnulees > 0) parts.push(`${d.echeancesAnnulees} échéance(s) stoppée(s)`);
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

  const OPTIONS: { key: Mode; label: string; desc: string; refund: boolean }[] = [
    { key: "refund_keep", label: "Rembourser un montant, garder les échéances", desc: "Le dossier reste actif.", refund: true },
    { key: "refund_stop", label: "Rembourser un montant + stopper les échéances", desc: "Le dossier sera annulé.", refund: true },
    { key: "refund_all", label: "Rembourser intégralement", desc: `Tout l'encaissé (${euro(remboursable)}) + arrêt des échéances. Dossier annulé.`, refund: true },
    { key: "stop_only", label: "Ne pas rembourser, stopper les échéances", desc: "Aucun mouvement d'argent. Dossier annulé.", refund: false },
  ];

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-ink/40 p-4">
      <div className="max-h-[92vh] w-full max-w-lg overflow-y-auto rounded-[1.5rem] bg-white p-6">
        <div className="flex items-start justify-between gap-4">
          <h2 className="font-display text-xl font-extrabold uppercase text-ink">
            Gérer le paiement
          </h2>
          <button onClick={onClose} className="shrink-0 text-2xl leading-none text-smoke hover:text-ink" aria-label="Fermer">×</button>
        </div>
        <p className="mt-1 text-sm text-smoke">
          {adherent.prenom} {adherent.nom}
        </p>

        {/* Récap chiffré */}
        <div className="mt-4 grid grid-cols-3 gap-2 text-center">
          <Box label="Encaissé" value={euro(encaisse)} />
          <Box label="Déjà remboursé" value={euro(dejaRembourse)} />
          <Box label="Remboursable" value={euro(remboursable)} accent />
        </div>

        {especes && (
          <p className="mt-3 rounded-xl bg-amber-50 px-3 py-2 text-xs font-semibold text-amber-800">
            Paiement en espèces : aucun remboursement carte possible depuis l&apos;application.
          </p>
        )}

        {step === "choix" ? (
          <div className="mt-5 space-y-2">
            {OPTIONS.map((o) => {
              const disabled = o.refund && !peutRembourser;
              return (
                <label
                  key={o.key}
                  className={`flex cursor-pointer items-start gap-3 rounded-xl border p-3 ${
                    mode === o.key ? "border-orange bg-orange-50" : "border-line"
                  } ${disabled ? "cursor-not-allowed opacity-40" : ""}`}
                >
                  <input
                    type="radio"
                    name="mode"
                    className="mt-0.5 h-4 w-4 accent-orange"
                    checked={mode === o.key}
                    disabled={disabled}
                    onChange={() => setMode(o.key)}
                  />
                  <span>
                    <span className="block text-sm font-semibold text-ink">{o.label}</span>
                    <span className="block text-xs text-smoke">{o.desc}</span>
                  </span>
                </label>
              );
            })}

            {(mode === "refund_keep" || mode === "refund_stop") && (
              <label className="block pt-1">
                <span className="mb-1 block text-sm font-semibold text-ink">
                  Montant à rembourser (max {euro(remboursable)})
                </span>
                <input
                  inputMode="decimal"
                  value={montantStr}
                  onChange={(e) => setMontantStr(e.target.value)}
                  placeholder="0"
                  className="focus-ring w-40 rounded-xl border border-line bg-paper-2 px-3 py-2 text-sm outline-none focus:border-orange"
                />
              </label>
            )}

            {error && <p className="text-sm font-semibold text-red-600">{error}</p>}

            <div className="flex items-center justify-end gap-3 pt-2">
              <button onClick={onClose} className="text-sm font-semibold text-smoke hover:text-ink">Annuler</button>
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
                {montantEffectif > 0
                  ? `Tu vas rembourser ${euro(montantEffectif)}`
                  : "Tu vas annuler le dossier"}
                {mode !== "refund_keep" && nbFutures > 0
                  ? ` et stopper ${nbFutures} échéance(s) à venir.`
                  : "."}
                {mode === "refund_keep" && " Les échéances sont conservées (dossier actif)."}
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
                  : montantEffectif > 0
                    ? `Confirmer le remboursement de ${euro(montantEffectif)}`
                    : "Confirmer l'annulation"}
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
