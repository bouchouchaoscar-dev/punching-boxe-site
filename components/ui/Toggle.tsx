"use client";

/** Segmented Oui / Non. */
export function Toggle({
  value,
  onChange,
  label,
  hint,
}: {
  value: boolean;
  onChange: (v: boolean) => void;
  label: string;
  hint?: string;
}) {
  return (
    <div className="flex items-center justify-between gap-4 rounded-xl border border-line bg-white p-4">
      <div>
        <p className="font-semibold text-ink">{label}</p>
        {hint && <p className="mt-0.5 text-xs text-smoke">{hint}</p>}
      </div>
      <div className="relative flex shrink-0 rounded-full bg-paper-2 p-1">
        {[
          { v: false, l: "Non" },
          { v: true, l: "Oui" },
        ].map((o) => (
          <button
            key={o.l}
            type="button"
            onClick={() => onChange(o.v)}
            className={`relative z-10 rounded-full px-5 py-1.5 text-sm font-bold transition-colors ${
              value === o.v
                ? o.v
                  ? "bg-orange text-white"
                  : "bg-ink text-white"
                : "text-smoke"
            }`}
          >
            {o.l}
          </button>
        ))}
      </div>
    </div>
  );
}
