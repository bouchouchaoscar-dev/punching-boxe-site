"use client";

import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import { Info } from "lucide-react";

// Icône « i » discrète + infobulle. Marche desktop (survol), mobile (tap) et
// clavier (focus). Ferme au clic extérieur / Échap. Panneau ancré sous l'icône,
// largeur fixe bornée pour ne jamais déborder de l'écran.
export function InfoHint({
  content,
  label = "Informations",
  className = "",
}: {
  content: ReactNode;
  label?: string;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const id = useId();

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
    <div
      ref={ref}
      className={`relative inline-flex ${className}`}
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={() => setOpen(false)}
    >
      <button
        type="button"
        aria-label={label}
        aria-describedby={open ? id : undefined}
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
        onFocus={() => setOpen(true)}
        onBlur={() => setOpen(false)}
        className="inline-flex h-7 w-7 items-center justify-center rounded-full border border-line bg-white text-smoke transition-colors hover:border-ink hover:text-ink"
      >
        <Info className="h-4 w-4" />
      </button>
      {open && (
        <div
          id={id}
          role="tooltip"
          className="absolute left-0 top-full z-50 mt-2 w-72 max-w-[calc(100vw-2rem)] rounded-xl border border-line bg-white p-3 text-left text-sm font-normal normal-case leading-snug tracking-normal text-smoke shadow-lg"
        >
          {content}
        </div>
      )}
    </div>
  );
}
