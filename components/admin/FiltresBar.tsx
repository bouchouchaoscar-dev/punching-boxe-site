"use client";

import { useState, type ReactNode } from "react";
import { Search, SlidersHorizontal } from "lucide-react";
import { BottomSheet } from "@/components/ui/BottomSheet";

// Barre recherche + filtres — SOURCE UNIQUE (Adhérents, Trombinoscope…).
// Mobile (< md) : champ de recherche pleine largeur (loupe intégrée) + bouton
// « Filtres » (badge du nombre de filtres actifs) ouvrant une feuille contenant
// les filtres + « Réinitialiser ». Desktop (≥ md) : recherche + filtres inline.
//
// `children` = contrôles de filtre (selects), rendus DEUX fois : inline (desktop)
// et dans la feuille (mobile). Contrôlés → sûr. Prévoir `w-full md:w-auto`.
export function FiltresBar({
  q,
  onQ,
  placeholder = "Rechercher…",
  activeCount = 0,
  onReset,
  children,
  className = "",
}: {
  q: string;
  onQ: (v: string) => void;
  placeholder?: string;
  activeCount?: number;
  onReset?: () => void;
  children?: ReactNode;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  return (
    <div className={className}>
      <div className="flex items-center gap-2 md:flex-wrap">
        <div className="relative min-w-0 flex-1 md:w-72 md:flex-none">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-smoke" />
          <input
            value={q}
            onChange={(e) => onQ(e.target.value)}
            placeholder={placeholder}
            className="focus-ring w-full rounded-xl border border-line bg-white py-2.5 pl-9 pr-3 text-sm outline-none focus:border-orange"
          />
        </div>

        {/* Filtres inline — desktop */}
        {children && (
          <div className="hidden md:flex md:flex-wrap md:items-center md:gap-2">{children}</div>
        )}

        {/* Bouton « Filtres » — mobile */}
        {children && (
          <button
            onClick={() => setOpen(true)}
            className="relative flex h-11 shrink-0 items-center gap-1.5 rounded-xl border border-line bg-white px-3 text-sm font-semibold text-ink md:hidden"
          >
            <SlidersHorizontal className="h-4 w-4" />
            Filtres
            {activeCount > 0 && (
              <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-orange px-1 text-[0.65rem] font-bold text-white">
                {activeCount}
              </span>
            )}
          </button>
        )}
      </div>

      {open && (
        <BottomSheet title="Filtres" onClose={() => setOpen(false)}>
          <div className="space-y-3">{children}</div>
          <div className="mt-5 flex gap-2">
            {onReset && (
              <button
                onClick={() => onReset()}
                className="flex-1 rounded-full border border-line bg-white px-4 py-2.5 text-sm font-semibold text-ink"
              >
                Réinitialiser
              </button>
            )}
            <button
              onClick={() => setOpen(false)}
              className="flex-1 rounded-full bg-orange px-4 py-2.5 text-sm font-bold text-white"
            >
              Voir les résultats
            </button>
          </div>
        </BottomSheet>
      )}
    </div>
  );
}
