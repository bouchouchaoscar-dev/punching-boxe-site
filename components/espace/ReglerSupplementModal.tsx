"use client";

import { useState } from "react";
import { StripePayment, type StripePlan } from "@/components/inscription/StripePayment";
import { euro } from "@/lib/pricing";
import type { Adherent } from "@/lib/types";

// Espace adhérent — règle un supplément de changement de formule « à régler »
// (créé par l'admin). L'adhérent choisit CARTE (tunnel existant) ou ESPÈCES.
// Indépendant du mode de paiement de la cotisation.
export function ReglerSupplementModal({
  adherent,
  token,
  onClose,
}: {
  adherent: Adherent;
  token: string;
  onClose: () => void;
}) {
  const montant = adherent.supplement?.montantEuros ?? 0;
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [plan, setPlan] = useState<StripePlan | null>(null);
  const headers = { "Content-Type": "application/json", Authorization: `Bearer ${token}` };

  async function choisir(mode: "carte" | "especes") {
    setBusy(true);
    setError("");
    try {
      const res = await fetch("/api/mon-espace/supplement/choisir", {
        method: "POST",
        headers,
        body: JSON.stringify({ adherentId: adherent.id, mode }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Impossible.");
      if (mode === "especes") { window.location.href = "/mon-espace"; return; }
      setPlan({
        intentType: "payment",
        clientSecret: data.clientSecret,
        adherentId: adherent.id,
        paiementId: data.paiementId,
        nbEcheances: 1,
        total: data.montant,
        adhesion: 0,
        premierPrelevement: data.montant,
        dates: [new Date().toISOString().slice(0, 10)],
        montants: [data.montant],
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erreur.");
    } finally {
      setBusy(false);
    }
  }

  async function apresPaiement() {
    try {
      await fetch("/api/mon-espace/supplement/confirm", { method: "POST", headers, body: JSON.stringify({ adherentId: adherent.id }) });
    } catch { /* webhook */ }
    window.location.href = "/mon-espace";
  }

  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center bg-ink/50 p-4" onClick={onClose}>
      <div className="max-h-[90vh] w-full max-w-md overflow-y-auto rounded-[1.5rem] bg-white p-6" onClick={(e) => e.stopPropagation()}>
        <h2 className="font-display text-xl font-extrabold uppercase text-ink">Régler le supplément</h2>
        <p className="mt-2 text-sm text-smoke">Supplément de votre changement de formule : <strong className="text-ink">{euro(montant)}</strong></p>
        {!plan ? (
          <>
            {error && <p className="mt-3 rounded-xl bg-red-50 p-3 text-sm font-semibold text-red-700">{error}</p>}
            <div className="mt-5 flex flex-col gap-2">
              <button onClick={() => choisir("carte")} disabled={busy} className="rounded-full bg-orange px-5 py-3 text-sm font-bold text-white hover:bg-orange/90 disabled:opacity-50">
                {busy ? "…" : "Payer par carte"}
              </button>
              <button onClick={() => choisir("especes")} disabled={busy} className="rounded-full border border-line px-5 py-3 text-sm font-semibold text-ink hover:border-orange disabled:opacity-50">
                Régler en espèces au prochain cours
              </button>
              <button onClick={onClose} className="mt-1 text-sm font-semibold text-smoke hover:text-ink">Annuler</button>
            </div>
          </>
        ) : (
          <div className="mt-5">
            <StripePayment plan={plan} onSuccess={apresPaiement} confirmPath="/api/mon-espace/supplement/confirm" />
          </div>
        )}
      </div>
    </div>
  );
}
