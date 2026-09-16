"use client";

import { useEffect, useId, useRef, useState, type ReactNode } from "react";

// Infobulle réutilisable qui marche DESKTOP (survol) ET MOBILE (tap).
// - Desktop : ouverture au hover (onMouseEnter/Leave) + focus clavier.
// - Mobile : ouverture au tap (onClick), fermeture au clic extérieur (mousedown
//   + ref.contains) et à Escape — même mécanique que EmojiPicker.
// Panneau flottant sous le déclencheur, largeur = déclencheur (left-0/right-0)
// → ne déborde jamais horizontalement de l'écran ; liste longue scrollable.
export function Tooltip({
  content,
  children,
  className = "",
}: {
  content: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const panelId = useId();

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
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
      className={`relative ${className}`}
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={() => setOpen(false)}
    >
      <button
        type="button"
        className="block h-full w-full cursor-help text-left"
        aria-describedby={open ? panelId : undefined}
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
        onFocus={() => setOpen(true)}
        onBlur={() => setOpen(false)}
      >
        {children}
      </button>
      {open && (
        <div
          id={panelId}
          role="tooltip"
          className="absolute left-0 right-0 top-full z-50 mt-2 max-h-72 overflow-auto rounded-xl border border-line bg-white p-3 text-left shadow-lg"
        >
          {content}
        </div>
      )}
    </div>
  );
}
