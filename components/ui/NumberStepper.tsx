"use client";

/** Compteur +/- (réutilisable). Clavier numérique sur mobile. */
export function NumberStepper({
  value,
  onChange,
  min = 0,
  max = 9,
  label,
  suffix,
}: {
  value: number;
  onChange: (v: number) => void;
  min?: number;
  max?: number;
  label?: string;
  suffix?: string;
}) {
  const set = (v: number) => onChange(Math.max(min, Math.min(max, v)));
  return (
    <div>
      {label && (
        <span className="mb-1.5 block text-sm font-semibold text-ink">{label}</span>
      )}
      <div className="inline-flex items-center gap-2 rounded-xl border border-line bg-paper-2 p-1.5">
        <button
          type="button"
          aria-label="Diminuer"
          onClick={() => set(value - 1)}
          disabled={value <= min}
          className="flex h-10 w-10 items-center justify-center rounded-lg bg-white text-xl font-bold text-ink shadow-sm transition-colors hover:text-orange disabled:opacity-40"
        >
          −
        </button>
        <div className="min-w-[3.5rem] text-center">
          <span className="font-display text-2xl font-extrabold text-ink">
            {value}
          </span>
          {suffix && <span className="ml-1 text-xs text-smoke">{suffix}</span>}
        </div>
        <button
          type="button"
          aria-label="Augmenter"
          onClick={() => set(value + 1)}
          disabled={value >= max}
          className="flex h-10 w-10 items-center justify-center rounded-lg bg-white text-xl font-bold text-ink shadow-sm transition-colors hover:text-orange disabled:opacity-40"
        >
          +
        </button>
      </div>
    </div>
  );
}
