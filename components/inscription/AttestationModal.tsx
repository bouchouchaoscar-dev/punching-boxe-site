"use client";

import { useState } from "react";

// Pop-up d'attestation sur l'honneur du foyer familial. Réutilisable :
// - foyer GROUPÉ (3e dossier et + sous un même compte)
// - rattachement de comptes séparés (à venir)
// La case est OBLIGATOIRE : le bouton de confirmation reste désactivé tant
// qu'elle n'est pas cochée. Composant de présentation pur (aucun appel réseau).
export function AttestationModal({
  message,
  confirmLabel = "Je confirme et continue",
  onConfirm,
  onCancel,
}: {
  message: string;
  confirmLabel?: string;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const [checked, setChecked] = useState(false);

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-ink/40 p-4">
      <div className="w-full max-w-md rounded-[1.5rem] bg-white p-6">
        <h2 className="font-display text-lg font-extrabold uppercase text-ink">
          Attestation sur l&apos;honneur
        </h2>
        <p className="mt-3 text-sm leading-relaxed text-ink">{message}</p>

        <label className="mt-4 flex cursor-pointer items-start gap-3 rounded-xl border border-line bg-paper-2 p-4">
          <input
            type="checkbox"
            checked={checked}
            onChange={(e) => setChecked(e.target.checked)}
            className="mt-0.5 h-4 w-4 shrink-0 accent-orange"
          />
          <span className="text-sm leading-relaxed text-ink">
            J&apos;atteste sur l&apos;honneur que ces membres appartiennent au
            même foyer familial. Une vérification sera effectuée lors de votre
            venue au club. <span className="text-orange">*</span>
          </span>
        </label>

        <div className="mt-5 flex items-center justify-end gap-3">
          <button
            onClick={onCancel}
            className="text-sm font-semibold text-smoke hover:text-ink"
          >
            Annuler
          </button>
          <button
            onClick={onConfirm}
            disabled={!checked}
            className="rounded-full bg-orange px-5 py-2.5 text-sm font-bold text-white transition-colors hover:bg-orange/90 disabled:opacity-50"
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
