"use client";

import { useState } from "react";
import { StripePayment, type StripePlan } from "@/components/inscription/StripePayment";
import { estEngage } from "@/lib/engagement";
import { prepaDuMois, euro } from "@/lib/pricing";
import type { Adherent } from "@/lib/types";

// Ajout de l'option prépa physique par l'adhérent (dossier « Boxe Française seule »).
// Récap court + tunnel existant. Prix recalculé SERVEUR (l'indicatif ci-dessous
// n'est qu'un affichage). Cas b carte (option B) : StripePayment → à la
// confirmation, on régénère/signe la fiche (redirection vers l'écran de signature).
export function AjouterPrepaModal({
  adherent,
  token,
  onClose,
}: {
  adherent: Adherent;
  token: string;
  onClose: () => void;
}) {
  const engage = estEngage(adherent);
  const prixIndicatif = prepaDuMois(new Date());
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [plan, setPlan] = useState<StripePlan | null>(null);

  const headers = { "Content-Type": "application/json", Authorization: `Bearer ${token}` };

  async function envoyer(mode?: "carte" | "especes") {
    setBusy(true);
    setError("");
    try {
      const res = await fetch("/api/mon-espace/ajouter-prepa", {
        method: "POST",
        headers,
        body: JSON.stringify({ adherentId: adherent.id, mode }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Impossible d'ajouter l'option.");
      if (data.cas === "b_carte") {
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
        return;
      }
      // Cas a / espèces : formule changée, on envoie signer la fiche actualisée.
      if (data.signature) window.location.href = data.signature;
      else window.location.href = "/mon-espace";
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erreur.");
    } finally {
      setBusy(false);
    }
  }

  async function apresPaiementCarte() {
    // Confirme (authentifié) → active la formule + renvoie le lien de signature.
    try {
      const res = await fetch("/api/mon-espace/supplement/confirm", {
        method: "POST",
        headers,
        body: JSON.stringify({ adherentId: adherent.id }),
      });
      const data = await res.json().catch(() => ({}));
      if (data.signature) { window.location.href = data.signature; return; }
    } catch { /* le webhook prend le relais */ }
    window.location.href = "/mon-espace";
  }

  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center bg-ink/50 p-4" onClick={onClose}>
      <div className="max-h-[90vh] w-full max-w-md overflow-y-auto rounded-[1.5rem] bg-white p-6" onClick={(e) => e.stopPropagation()}>
        <h2 className="font-display text-xl font-extrabold uppercase text-ink">Ajouter la prépa physique</h2>
        {!plan ? (
          <>
            <div className="mt-4 rounded-2xl border border-line bg-paper-2 p-4 text-sm">
              <p className="text-smoke">Formule actuelle</p>
              <p className="font-semibold text-ink">Boxe Française</p>
              <p className="mt-2 text-smoke">Nouvelle formule</p>
              <p className="font-semibold text-ink">Boxe Française + Prépa</p>
              <p className="mt-3 leading-relaxed text-ink">
                Vous aurez aussi accès aux cours de préparation physique.
              </p>
              <p className="mt-3 flex justify-between border-t border-line pt-3">
                <span className="text-smoke">Option préparation physique</span>
                <span className="font-bold text-ink">{euro(prixIndicatif)}</span>
              </p>
            </div>
            {error && <p className="mt-3 rounded-xl bg-red-50 p-3 text-sm font-semibold text-red-700">{error}</p>}
            <div className="mt-5 flex flex-col gap-2">
              {!engage ? (
                <button onClick={() => envoyer()} disabled={busy} className="rounded-full bg-orange px-5 py-3 text-sm font-bold text-white hover:bg-orange/90 disabled:opacity-50">
                  {busy ? "…" : "Ajouter et signer la fiche"}
                </button>
              ) : (
                <>
                  <button onClick={() => envoyer("carte")} disabled={busy} className="rounded-full bg-orange px-5 py-3 text-sm font-bold text-white hover:bg-orange/90 disabled:opacity-50">
                    {busy ? "…" : "Payer le supplément par carte"}
                  </button>
                  <button onClick={() => envoyer("especes")} disabled={busy} className="rounded-full border border-line px-5 py-3 text-sm font-semibold text-ink hover:border-orange disabled:opacity-50">
                    Régler en espèces au prochain cours
                  </button>
                </>
              )}
              <button onClick={onClose} className="mt-1 text-sm font-semibold text-smoke hover:text-ink">Annuler</button>
            </div>
          </>
        ) : (
          <div className="mt-5">
            <p className="mb-3 text-sm text-smoke">Supplément : <strong className="text-ink">{euro(plan.total)}</strong></p>
            <StripePayment plan={plan} onSuccess={apresPaiementCarte} confirmPath="/api/mon-espace/supplement/confirm" />
          </div>
        )}
      </div>
    </div>
  );
}
