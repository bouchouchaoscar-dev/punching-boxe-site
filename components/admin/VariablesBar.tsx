"use client";

import { VARIABLES, BOUTONS } from "@/lib/campagnes";

// Barre de boutons d'insertion de variables + CTA, partagée par le constructeur
// de campagne ET l'éditeur de templates (une seule source de vérité).
export function VariablesBar({ onInsert }: { onInsert: (token: string) => void }) {
  return (
    <div className="mb-2 flex flex-wrap items-center gap-2">
      <span className="text-sm font-semibold text-ink">Insérer :</span>
      {VARIABLES.map((v) => (
        <button
          key={v.token}
          type="button"
          onClick={() => onInsert(v.token)}
          className="rounded-full border border-line bg-paper-2 px-2.5 py-1 text-xs font-semibold text-ink transition-colors hover:border-orange"
        >
          {v.label}
        </button>
      ))}
      {BOUTONS.map((b) => (
        <button
          key={b.token}
          type="button"
          onClick={() => onInsert(b.token)}
          className="rounded-full border border-orange/30 bg-orange-50 px-2.5 py-1 text-xs font-semibold text-orange transition-colors hover:border-orange"
        >
          {b.label}
        </button>
      ))}
    </div>
  );
}
