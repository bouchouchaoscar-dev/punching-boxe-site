"use client";

import { type ReactNode } from "react";

// Boîte de confirmation générique (centrée). Utilisée notamment avant un export
// (CSV, PDF). `variant` accent = confirmation neutre ; danger = destructif.
export function ConfirmDialog({
  title,
  message,
  confirmLabel = "Confirmer",
  cancelLabel = "Annuler",
  variant = "accent",
  busy = false,
  onConfirm,
  onCancel,
}: {
  title: string;
  message?: ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  variant?: "accent" | "danger";
  busy?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const confirmCls =
    variant === "danger"
      ? "bg-red-600 hover:bg-red-700"
      : "bg-orange hover:brightness-95";
  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center bg-ink/40 p-4" role="dialog" aria-modal="true">
      <div className="w-full max-w-md rounded-[1.5rem] bg-white p-6">
        <h2 className="font-display text-lg font-extrabold uppercase text-ink">{title}</h2>
        {message && <div className="mt-3 text-sm text-smoke">{message}</div>}
        <div className="mt-5 flex justify-end gap-3">
          <button
            onClick={onCancel}
            disabled={busy}
            className="rounded-full border border-line px-5 py-2.5 text-sm font-semibold text-ink disabled:opacity-50"
          >
            {cancelLabel}
          </button>
          <button
            onClick={onConfirm}
            disabled={busy}
            className={`rounded-full px-5 py-2.5 text-sm font-bold text-white disabled:opacity-50 ${confirmCls}`}
          >
            {busy ? "…" : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
