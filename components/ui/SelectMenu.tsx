"use client";

import { useEffect, useRef, useState } from "react";
import { ChevronDown, Check } from "lucide-react";

export type SelectOption = { value: string; label: string };

// Sélecteur compact partagé (déclencheur « Libellé ▾ » + menu déroulant avec
// l'option active marquée). Ferme au clic extérieur / touche Échap. Zone de tap
// ≥ 44px. Réutilisé pour les sous-pages du Planning et le filtre de type Mailing.
export function SelectMenu({
  value,
  options,
  onChange,
  label,
  variant = "neutre",
  align = "left",
  compact = false,
  className = "",
}: {
  value: string;
  options: SelectOption[];
  onChange: (value: string) => void;
  label?: string; // préfixe optionnel, ex. « Type »
  variant?: "accent" | "neutre";
  align?: "left" | "right";
  compact?: boolean; // pastille visuellement plus basse (zone de tap 44px conservée)
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const current = options.find((o) => o.value === value) ?? options[0];

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const styles =
    variant === "accent"
      ? "border-orange bg-orange-50 text-orange"
      : "border-line bg-white text-ink hover:border-orange";

  const contenu = (
    <>
      <span className="truncate">
        {label ? `${label} : ` : ""}
        {current?.label}
      </span>
      <ChevronDown className="h-4 w-4 shrink-0" strokeWidth={2.2} />
    </>
  );

  return (
    <div ref={ref} className={`relative ${className}`}>
      {compact ? (
        // Zone de tap 44px (bouton transparent) + pastille visible plus basse.
        <button
          onClick={() => setOpen((v) => !v)}
          aria-haspopup="menu"
          aria-expanded={open}
          className="flex h-11 max-w-full items-center"
        >
          <span className={`flex h-9 max-w-full items-center gap-1.5 rounded-full border px-3 text-xs font-semibold transition-colors ${styles}`}>
            {contenu}
          </span>
        </button>
      ) : (
        <button
          onClick={() => setOpen((v) => !v)}
          aria-haspopup="menu"
          aria-expanded={open}
          className={`flex h-11 max-w-full items-center gap-1.5 rounded-full border px-3 text-sm font-semibold transition-colors ${styles}`}
        >
          {contenu}
        </button>
      )}
      {open && (
        <div
          role="menu"
          className={`absolute z-50 mt-1 min-w-48 overflow-hidden rounded-xl border border-line bg-white py-1 shadow-lg ${
            align === "right" ? "right-0" : "left-0"
          }`}
        >
          {options.map((o) => {
            const actif = o.value === value;
            return (
              <button
                key={o.value}
                role="menuitemradio"
                aria-checked={actif}
                onClick={() => {
                  setOpen(false);
                  onChange(o.value);
                }}
                className={`flex w-full items-center justify-between gap-3 px-4 py-2.5 text-left text-sm font-semibold transition-colors hover:bg-paper-2 ${
                  actif ? "text-orange" : "text-ink"
                }`}
              >
                {o.label}
                {actif && <Check className="h-4 w-4 shrink-0" />}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
