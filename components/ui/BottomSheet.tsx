"use client";

import { useEffect, type ReactNode } from "react";
import { X } from "lucide-react";

// Feuille modale ancrée en bas (mobile). Fond semi-opaque cliquable pour fermer,
// panneau arrondi en haut, défilement interne, respect de la zone de sécurité.
// Réutilisée pour les filtres des pages admin (recherche + filtres).
export function BottomSheet({
  title,
  onClose,
  children,
}: {
  title: string;
  onClose: () => void;
  children: ReactNode;
}) {
  // Verrouille le scroll de l'arrière-plan tant que la feuille est ouverte.
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, []);

  return (
    <div className="fixed inset-0 z-[70] flex flex-col justify-end md:hidden" role="dialog" aria-modal="true" aria-label={title}>
      <div className="absolute inset-0 bg-ink/40" onClick={onClose} />
      <div
        style={{ paddingBottom: "env(safe-area-inset-bottom)", maxHeight: "85vh" }}
        className="relative flex max-h-[85vh] flex-col rounded-t-[1.5rem] border-t border-line bg-white shadow-2xl"
      >
        <div className="flex items-center justify-between border-b border-line px-5 py-4">
          <h2 className="font-display text-base font-extrabold uppercase text-ink">{title}</h2>
          <button
            onClick={onClose}
            aria-label="Fermer"
            className="flex h-11 w-11 items-center justify-center rounded-full text-smoke hover:text-ink"
          >
            <X className="h-5 w-5" />
          </button>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">{children}</div>
      </div>
    </div>
  );
}
