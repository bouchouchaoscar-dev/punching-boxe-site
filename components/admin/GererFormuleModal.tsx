"use client";

import { useState } from "react";
import { adminAuthHeaders } from "@/lib/admin-auth";
import { FORMULES_CLE, labelFormuleCle, labelFormuleDossier, prixOptionPrepa } from "@/lib/changement-formule";
import { formuleCle, euro, type PackageType, type FormuleCle } from "@/lib/pricing";
import type { Adherent } from "@/lib/types";

// Admin — « Gérer la formule » : 3 formules en cartes (libellés CONFIG_CLUB),
// formule actuelle mise en évidence. Montant SAISI par l'admin (sens : supplément
// / remboursement / aucun). Activation immédiate. Remboursement carte : le
// mouvement d'argent passe par « Gérer le paiement » (remboursement existant).
export function GererFormuleModal({
  adherent,
  onClose,
  onDone,
}: {
  adherent: Adherent;
  onClose: () => void;
  onDone: (msg: string) => void;
}) {
  const actuelle = formuleCle(adherent.package as PackageType, adherent.option_prepa_physique ?? false);
  const [cible, setCible] = useState<FormuleCle | null>(null);
  const [sens, setSens] = useState<"supplement" | "remboursement" | "aucun">("aucun");
  // Supplément : à régler par l'adhérent (défaut) / réglé sur place espèces / offert.
  // Remboursement : carte / hors-ligne.
  const [reglement, setReglement] = useState<"a_regler" | "especes_sur_place" | "offert" | "remboursement_carte" | "remboursement_hors_ligne">("a_regler");
  const [montant, setMontant] = useState<string>("");
  const [motif, setMotif] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [confirmer, setConfirmer] = useState(false);

  // Proposition par défaut : ajout de la prépa à un dossier BF → prix du jour.
  function choisir(c: FormuleCle) {
    setCible(c);
    setError("");
    if (actuelle === "boxe" && c === "boxe_prepa") {
      setSens("supplement");
      setReglement("a_regler");
      setMontant(String(prixOptionPrepa(new Date())));
    } else {
      setSens("aucun");
      setReglement("a_regler");
      setMontant("");
    }
  }

  async function valider() {
    if (!cible) return;
    setBusy(true);
    setError("");
    try {
      const res = await fetch(`/api/admin/adherents/${adherent.id}/changer-formule`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...adminAuthHeaders() },
        body: JSON.stringify({
          nouvelleFormule: cible,
          sens,
          reglement,
          montantEuros: Number(montant || 0),
          motif: motif.trim() || null,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Changement impossible.");
      const suite = data.remboursement ? " Effectuez le remboursement via « Gérer le paiement »." : "";
      onDone(`Formule mise à jour → ${labelFormuleCle(cible)}.${suite}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erreur.");
      setBusy(false);
    }
  }

  const montantNum = Number(montant || 0);
  const recapOk =
    cible &&
    (sens === "aucun" ||
      (sens === "supplement" && (reglement === "offert" || montantNum > 0)) ||
      (sens === "remboursement" && montantNum > 0));

  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center bg-ink/50 p-4" onClick={onClose}>
      <div className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-[1.5rem] bg-white p-6" onClick={(e) => e.stopPropagation()}>
        <h2 className="font-display text-xl font-extrabold uppercase text-ink">Gérer la formule</h2>
        <p className="mt-1 text-sm text-smoke">Formule actuelle : <strong className="text-ink">{labelFormuleDossier(adherent)}</strong></p>

        <div className="mt-4 grid gap-2 sm:grid-cols-3">
          {FORMULES_CLE.map((c) => {
            const active = cible === c;
            const estActuelle = actuelle === c;
            return (
              <button
                key={c}
                type="button"
                disabled={estActuelle}
                onClick={() => choisir(c)}
                className={`rounded-xl border-2 p-3 text-left text-sm transition-colors ${
                  active ? "border-orange bg-orange-50" : estActuelle ? "border-line bg-paper-2 opacity-60" : "border-line hover:border-orange/40"
                }`}
              >
                <span className="font-semibold text-ink">{labelFormuleCle(c)}</span>
                {estActuelle && <span className="mt-1 block text-[11px] text-smoke">Actuelle</span>}
              </button>
            );
          })}
        </div>

        {cible && cible !== actuelle && (
          <div className="mt-4 space-y-3">
            <div className="flex gap-2">
              {(["supplement", "remboursement", "aucun"] as const).map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => { setSens(s); setReglement(s === "remboursement" ? "remboursement_carte" : "a_regler"); }}
                  className={`rounded-full border px-3 py-1.5 text-xs font-semibold ${sens === s ? "border-orange bg-orange-50 text-orange" : "border-line text-ink/70"}`}
                >
                  {s === "supplement" ? "Supplément à payer" : s === "remboursement" ? "Remboursement" : "Aucun montant"}
                </button>
              ))}
            </div>

            {sens !== "aucun" && (
              <div className="flex items-center gap-3">
                <label className="text-sm text-smoke">Montant</label>
                <input
                  type="number" min={0} step="0.01" value={montant}
                  onChange={(e) => setMontant(e.target.value)}
                  className="focus-ring w-28 rounded-xl border border-line px-3 py-2 text-sm outline-none focus:border-orange"
                  placeholder="€"
                />
                {sens === "supplement" && (
                  <select value={reglement} onChange={(e) => setReglement(e.target.value as typeof reglement)} className="rounded-xl border border-line px-2 py-2 text-sm">
                    <option value="a_regler">À régler par l&apos;adhérent</option>
                    <option value="especes_sur_place">Réglé sur place en espèces</option>
                    <option value="offert">Offert</option>
                  </select>
                )}
                {sens === "remboursement" && (
                  <select value={reglement} onChange={(e) => setReglement(e.target.value as typeof reglement)} className="rounded-xl border border-line px-2 py-2 text-sm">
                    <option value="remboursement_carte">Carte (via Gérer le paiement)</option>
                    <option value="remboursement_hors_ligne">Hors ligne</option>
                  </select>
                )}
              </div>
            )}

            <input
              value={motif} onChange={(e) => setMotif(e.target.value)}
              placeholder="Motif (facultatif : régularisation, erreur d'inscription…)"
              className="focus-ring w-full rounded-xl border border-line px-3 py-2 text-sm outline-none focus:border-orange"
            />

            {/* Récap chiffré + confirmation explicite (action potentiellement irréversible). */}
            <div className="rounded-xl border border-line bg-paper-2 p-3 text-sm">
              <p><strong>{labelFormuleDossier(adherent)}</strong> → <strong>{labelFormuleCle(cible)}</strong></p>
              {sens === "supplement" && reglement === "offert" && <p className="mt-1">Offert.</p>}
              {sens === "supplement" && reglement === "a_regler" && <p className="mt-1">Supplément : <strong>{euro(montantNum)}</strong> — l&apos;adhérent choisira carte ou espèces dans son espace.</p>}
              {sens === "supplement" && reglement === "especes_sur_place" && <p className="mt-1">Supplément : <strong>{euro(montantNum)}</strong> — <strong>réglé sur place en espèces</strong> (encaissé immédiatement).</p>}
              {sens === "remboursement" && <p className="mt-1 text-red-700">Remboursement : <strong>{euro(montantNum)}</strong> {reglement === "remboursement_carte" ? "(carte — à exécuter via Gérer le paiement)" : "(hors ligne)"}.</p>}
              <p className="mt-1 text-xs text-smoke">La fiche d'inscription sera à re-signer (lien envoyé à l'adhérent).</p>
            </div>

            {error && <p className="rounded-xl bg-red-50 p-3 text-sm font-semibold text-red-700">{error}</p>}

            {!confirmer ? (
              <button onClick={() => setConfirmer(true)} disabled={!recapOk || busy} className="w-full rounded-full bg-ink px-5 py-3 text-sm font-bold text-white disabled:opacity-40">
                Continuer
              </button>
            ) : (
              <div className="flex gap-2">
                <button onClick={() => setConfirmer(false)} disabled={busy} className="flex-1 rounded-full border border-line px-5 py-3 text-sm font-semibold text-ink">Modifier</button>
                <button onClick={valider} disabled={busy} className="flex-1 rounded-full bg-orange px-5 py-3 text-sm font-bold text-white disabled:opacity-50">{busy ? "…" : "Confirmer le changement"}</button>
              </div>
            )}
          </div>
        )}

        <button onClick={onClose} className="mt-4 text-sm font-semibold text-smoke hover:text-ink">Fermer</button>
      </div>
    </div>
  );
}
