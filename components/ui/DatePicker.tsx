"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";

const MOIS = [
  "Janvier", "Février", "Mars", "Avril", "Mai", "Juin",
  "Juillet", "Août", "Septembre", "Octobre", "Novembre", "Décembre",
];
const JOURS = ["L", "M", "M", "J", "V", "S", "D"];

const slideVariants = {
  enter: (d: number) => ({ x: d > 0 ? 40 : d < 0 ? -40 : 0, opacity: 0 }),
  center: { x: 0, opacity: 1 },
  exit: (d: number) => ({ x: d > 0 ? -40 : 40, opacity: 0 }),
};

const pad = (n: number) => String(n).padStart(2, "0");
const toISO = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const formatFR = (iso: string) => {
  const [y, m, d] = iso.split("-");
  return `${d}/${m}/${y}`;
};
function parseISO(iso: string): Date | null {
  if (!iso) return null;
  const [y, m, d] = iso.split("-").map(Number);
  if (!y || !m || !d) return null;
  return new Date(y, m - 1, d);
}

export function DatePicker({
  value,
  onChange,
  label,
  required,
  placeholder = "JJ/MM/AAAA",
}: {
  value: string;
  onChange: (iso: string) => void;
  label?: string;
  required?: boolean;
  placeholder?: string;
}) {
  const selected = parseISO(value);
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<"days" | "years">("days");
  const [direction, setDirection] = useState(0);
  const [view, setView] = useState(() => {
    const base = selected ?? new Date(2010, 0, 1); // défaut orienté date de naissance
    return new Date(base.getFullYear(), base.getMonth(), 1);
  });
  const [yearPage, setYearPage] = useState(() => (selected ?? new Date(2010, 0, 1)).getFullYear());
  const ref = useRef<HTMLDivElement>(null);

  // Fermeture au clic extérieur + Échap
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

  const year = view.getFullYear();
  const month = view.getMonth();

  const cells = useMemo(() => {
    const first = new Date(year, month, 1);
    const offset = (first.getDay() + 6) % 7; // Lundi = 0
    const nbDays = new Date(year, month + 1, 0).getDate();
    const arr: (number | null)[] = Array(offset).fill(null);
    for (let d = 1; d <= nbDays; d++) arr.push(d);
    return arr;
  }, [year, month]);

  const todayISO = toISO(new Date());

  function changeMonth(delta: number) {
    setDirection(delta);
    setView(new Date(year, month + delta, 1));
  }

  function pick(day: number) {
    onChange(toISO(new Date(year, month, day)));
    setOpen(false);
  }

  const years = useMemo(() => {
    const start = yearPage - 6;
    return Array.from({ length: 12 }, (_, i) => start + i);
  }, [yearPage]);

  return (
    <div className="relative" ref={ref}>
      {label && (
        <span className="mb-1.5 block text-sm font-semibold text-ink">
          {label} {required && <span className="text-orange">*</span>}
        </span>
      )}

      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="dialog"
        aria-expanded={open}
        className={`focus-ring flex w-full items-center justify-between rounded-xl border bg-paper-2 px-4 py-3 text-left outline-none transition-colors ${
          open ? "border-orange" : "border-line"
        }`}
      >
        <span className={value ? "text-ink" : "text-smoke"}>
          {value ? formatFR(value) : placeholder}
        </span>
        <svg viewBox="0 0 24 24" className="h-5 w-5 text-smoke" fill="none" aria-hidden>
          <rect x="3" y="5" width="18" height="16" rx="2" stroke="currentColor" strokeWidth="1.6" />
          <path d="M3 9h18M8 3v4M16 3v4" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
        </svg>
      </button>

      <AnimatePresence>
        {open && (
          <motion.div
            role="dialog"
            initial={{ opacity: 0, y: 8, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 8, scale: 0.98 }}
            transition={{ duration: 0.18, ease: [0.16, 1, 0.3, 1] }}
            className="absolute left-0 z-50 mt-2 w-[320px] max-w-[calc(100vw-2.5rem)] overflow-hidden rounded-xl border border-line bg-white p-3 shadow-[0_30px_60px_-25px_rgba(0,0,0,0.3)]"
          >
            {/* Header */}
            <div className="flex items-center justify-between px-1 pb-2">
              <Arrow
                dir="left"
                onClick={() => (mode === "days" ? changeMonth(-1) : setYearPage((y) => y - 12))}
              />
              <button
                type="button"
                onClick={() => {
                  setYearPage(year);
                  setMode((m) => (m === "days" ? "years" : "days"));
                }}
                className="rounded-lg px-3 py-1 font-display text-sm font-extrabold uppercase tracking-tight text-ink transition-colors hover:bg-paper-2"
              >
                {mode === "days" ? `${MOIS[month]} ${year}` : `${years[0]} – ${years[11]}`}
              </button>
              <Arrow
                dir="right"
                onClick={() => (mode === "days" ? changeMonth(1) : setYearPage((y) => y + 12))}
              />
            </div>

            {mode === "days" ? (
              <>
                <div className="grid grid-cols-7 px-1 pb-1">
                  {JOURS.map((j, i) => (
                    <span
                      key={i}
                      className="py-1 text-center text-xs font-bold uppercase text-smoke"
                    >
                      {j}
                    </span>
                  ))}
                </div>
                <div className="relative overflow-hidden">
                  <AnimatePresence initial={false} custom={direction} mode="popLayout">
                    <motion.div
                      key={`${year}-${month}`}
                      custom={direction}
                      variants={slideVariants}
                      initial="enter"
                      animate="center"
                      exit="exit"
                      transition={{ duration: 0.22, ease: [0.16, 1, 0.3, 1] }}
                      className="grid grid-cols-7 gap-0.5"
                    >
                      {cells.map((day, i) => {
                        if (day === null) return <span key={i} />;
                        const iso = toISO(new Date(year, month, day));
                        const isSelected = iso === value;
                        const isToday = iso === todayISO;
                        return (
                          <button
                            key={i}
                            type="button"
                            onClick={() => pick(day)}
                            className={`mx-auto flex h-9 w-9 items-center justify-center rounded-full text-sm transition-colors ${
                              isSelected
                                ? "bg-orange font-bold text-white"
                                : isToday
                                  ? "font-bold text-orange hover:bg-paper-2"
                                  : "text-ink hover:bg-paper-2"
                            }`}
                          >
                            {day}
                          </button>
                        );
                      })}
                    </motion.div>
                  </AnimatePresence>
                </div>
              </>
            ) : (
              <div className="grid grid-cols-3 gap-1.5 p-1">
                {years.map((y) => {
                  const isSel = selected?.getFullYear() === y;
                  return (
                    <button
                      key={y}
                      type="button"
                      onClick={() => {
                        setView(new Date(y, month, 1));
                        setMode("days");
                      }}
                      className={`rounded-lg py-2.5 text-sm font-semibold transition-colors ${
                        isSel
                          ? "bg-orange text-white"
                          : "text-ink hover:bg-paper-2"
                      }`}
                    >
                      {y}
                    </button>
                  );
                })}
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function Arrow({ dir, onClick }: { dir: "left" | "right"; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={dir === "left" ? "Précédent" : "Suivant"}
      className="flex h-8 w-8 items-center justify-center rounded-lg text-ink transition-colors hover:bg-paper-2"
    >
      <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none">
        <path
          d={dir === "left" ? "M15 6l-6 6 6 6" : "M9 6l6 6-6 6"}
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    </button>
  );
}
