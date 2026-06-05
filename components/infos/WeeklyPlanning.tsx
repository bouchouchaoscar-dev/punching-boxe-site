"use client";

import { useRef, useState } from "react";
import { Reveal } from "@/components/ui/Reveal";
import { HORAIRES, type Creneau } from "@/lib/constants";

// Lundi → Vendredi uniquement (week-end = repos, colonnes inutiles).
const JOURS = ["Lundi", "Mardi", "Mercredi", "Jeudi", "Vendredi"];

/** Style d'une card en fonction du cours et du public. */
function cardStyle(c: Creneau): { className: string; style?: React.CSSProperties; badge: string } {
  if (c.cours === "Préparation Physique")
    return { className: "bg-ink text-white", badge: "bg-white/15 text-white" };
  if (c.cours === "Savate Fitness")
    return {
      className: "text-white",
      style: { backgroundColor: "#ff9a52" },
      badge: "bg-white/25 text-white",
    };
  if (c.public === "Enfants")
    return {
      className: "bg-orange-50 text-orange-600 ring-1 ring-orange/20",
      badge: "bg-orange/15 text-orange-600",
    };
  // Boxe Française Adultes
  return { className: "bg-orange text-white", badge: "bg-white/20 text-white" };
}

export function WeeklyPlanning() {
  const parJour = (jour: string) => HORAIRES.filter((h) => h.jour === jour);
  const [showHint, setShowHint] = useState(true);
  const scrollRef = useRef<HTMLDivElement>(null);

  return (
    <Reveal className="relative">
      <div
        ref={scrollRef}
        onScroll={(e) => {
          if (e.currentTarget.scrollLeft > 8) setShowHint(false);
        }}
        className="-mx-4 overflow-x-auto px-4 pb-2 sm:mx-0 sm:px-0"
      >
        <div className="grid min-w-[44rem] grid-cols-5 gap-3 lg:min-w-0">
        {JOURS.map((jour) => {
          const creneaux = parJour(jour);
          return (
            <div key={jour} className="flex flex-col">
              <div className="mb-3 text-center">
                <span className="font-display text-sm font-extrabold uppercase tracking-tight text-ink">
                  {jour}
                </span>
              </div>

              <div className="flex flex-1 flex-col gap-2">
                {creneaux.length === 0 ? (
                  <div className="flex h-full min-h-[5rem] items-center justify-center rounded-xl border border-dashed border-line">
                    <span className="text-xs font-semibold uppercase tracking-wide text-smoke">
                      Repos
                    </span>
                  </div>
                ) : (
                  creneaux.map((c, i) => {
                    const s = cardStyle(c);
                    return (
                      <div
                        key={i}
                        className={`rounded-xl p-3 ${s.className}`}
                        style={s.style}
                      >
                        <p className="text-[0.82rem] font-bold leading-tight">
                          {c.cours}
                        </p>
                        <p className="mt-1 text-[0.72rem] font-semibold opacity-95">
                          {c.heure}
                        </p>
                        <p className="mt-1 text-[0.66rem] leading-tight opacity-80">
                          {c.salle}
                          {c.ville ? ` · ${c.ville}` : ""}
                        </p>
                        <span
                          className={`mt-2 inline-block rounded-full px-2 py-0.5 text-[0.6rem] font-bold uppercase tracking-wide ${s.badge}`}
                        >
                          {c.public}
                        </span>
                      </div>
                    );
                  })
                )}
              </div>
            </div>
          );
        })}
        </div>
      </div>

      {/* Indicateur de scroll horizontal — mobile uniquement */}
      {showHint && (
        <>
          <div className="pointer-events-none absolute inset-y-0 right-0 w-12 bg-gradient-to-l from-paper-2 to-transparent sm:hidden" />
          <div className="pointer-events-none absolute bottom-3 right-2 flex animate-pulse items-center gap-1.5 rounded-full bg-ink px-3 py-1.5 text-[0.65rem] font-bold uppercase tracking-wide text-white shadow-lg sm:hidden">
            Glissez pour voir la suite
            <span aria-hidden className="text-sm">→</span>
          </div>
        </>
      )}
    </Reveal>
  );
}
