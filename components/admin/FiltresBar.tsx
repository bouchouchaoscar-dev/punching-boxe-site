"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { Search, SlidersHorizontal } from "lucide-react";
import { BottomSheet } from "@/components/ui/BottomSheet";

// Barre recherche + filtres — SOURCE UNIQUE (Adhérents, Trombinoscope…).
// Champ de recherche (loupe intégrée) + bouton « Filtres » (badge du nombre de
// filtres actifs). Le bouton ouvre :
//  - desktop (≥ md) : un popover ancré sous le bouton (fermé au clic extérieur /
//    Échap) ;
//  - mobile (< md) : une feuille (BottomSheet).
// Les filtres (`children`) sont empilés pleine largeur dans le panneau + un
// bouton « Réinitialiser ». Prévoir des contrôles `w-full`.
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
  const ref = useRef<HTMLDivElement>(null);

  // Fermeture du popover desktop au clic extérieur / Échap (le mobile a son
  // propre overlay ; ces écouteurs le ferment aussi, sans effet de bord).
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <div ref={ref} className={className}>
      <div className="flex items-center gap-2">
        <div className="relative min-w-0 flex-1 md:w-80 md:flex-none">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-smoke" />
          <input
            value={q}
            onChange={(e) => onQ(e.target.value)}
            placeholder={placeholder}
            className="focus-ring w-full rounded-xl border border-line bg-white py-2.5 pl-9 pr-3 text-sm outline-none focus:border-orange"
          />
        </div>

        {children && (
          <div className="relative">
            <button
              onClick={() => setOpen((o) => !o)}
              aria-haspopup="dialog"
              aria-expanded={open}
              className="flex h-11 shrink-0 items-center gap-1.5 rounded-xl border border-line bg-white px-3 text-sm font-semibold text-ink transition-colors hover:border-ink"
            >
              <SlidersHorizontal className="h-4 w-4" />
              Filtres
              {activeCount > 0 && (
                <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-orange px-1 text-[0.65rem] font-bold text-white">
                  {activeCount}
                </span>
              )}
            </button>

            {/* Popover — desktop uniquement */}
            {open && (
              <div className="absolute right-0 top-full z-50 mt-2 hidden w-72 rounded-xl border border-line bg-white p-4 shadow-lg md:block">
                <div className="space-y-3">{children}</div>
                <div className="mt-4 flex gap-2">
                  {onReset && (
                    <button
                      onClick={() => onReset()}
                      className="flex-1 rounded-full border border-line bg-white px-4 py-2 text-sm font-semibold text-ink hover:border-ink"
                    >
                      Réinitialiser
                    </button>
                  )}
                  <button
                    onClick={() => setOpen(false)}
                    className="flex-1 rounded-full bg-orange px-4 py-2 text-sm font-bold text-white hover:brightness-95"
                  >
                    Fermer
                  </button>
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Feuille — mobile uniquement */}
      {open && children && (
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
