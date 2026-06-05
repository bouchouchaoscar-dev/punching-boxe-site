"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { Reveal } from "@/components/ui/Reveal";
import { HORAIRES, type Creneau } from "@/lib/constants";

// Lundi → Vendredi uniquement (week-end = repos, colonnes inutiles).
const JOURS = ["Lundi", "Mardi", "Mercredi", "Jeudi", "Vendredi"];

// Ville abrégée (planning desktop uniquement) : "Nogent-sur-Marne" → "Nogent".
const villeCourte = (v: string) => v.replace("-sur-Marne", "");

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
  const scrollRef = useRef<HTMLDivElement>(null);
  const [canLeft, setCanLeft] = useState(false);
  const [canRight, setCanRight] = useState(false);

  const updateArrows = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    setCanLeft(el.scrollLeft > 5);
    setCanRight(el.scrollLeft + el.clientWidth < el.scrollWidth - 5);
  }, []);

  useEffect(() => {
    updateArrows();
    window.addEventListener("resize", updateArrows);
    return () => window.removeEventListener("resize", updateArrows);
  }, [updateArrows]);

  const scrollByDir = (dir: 1 | -1) => {
    scrollRef.current?.scrollBy({ left: dir * 200, behavior: "smooth" });
  };

  return (
    <Reveal className="relative">
      <div
        ref={scrollRef}
        onScroll={updateArrows}
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
                        className={`rounded-xl p-3 sm:min-h-[130px] ${s.className}`}
                        style={s.style}
                      >
                        <p className="text-[0.82rem] font-bold leading-tight">
                          {c.cours}
                        </p>
                        <p className="mt-1 text-[0.72rem] font-semibold opacity-95">
                          {c.heure}
                        </p>
                        <p className="mt-1 text-[0.66rem] leading-tight opacity-80 sm:overflow-hidden sm:text-ellipsis sm:whitespace-nowrap">
                          {c.salle}
                          {c.ville && (
                            <>
                              <span className="sm:hidden"> · {c.ville}</span>
                              <span className="hidden sm:inline">
                                {" "}
                                · {villeCourte(c.ville)}
                              </span>
                            </>
                          )}
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

      {/* Flèches de navigation — mobile uniquement */}
      {canLeft && (
        <button
          type="button"
          aria-label="Défiler vers la gauche"
          onClick={() => scrollByDir(-1)}
          className="absolute left-1 top-1/2 z-10 flex h-10 w-10 -translate-y-1/2 items-center justify-center rounded-full border border-line bg-white/80 text-orange shadow-md backdrop-blur-sm transition-colors hover:bg-white md:hidden"
        >
          <ChevronLeft className="h-5 w-5" strokeWidth={2.4} />
        </button>
      )}
      {canRight && (
        <button
          type="button"
          aria-label="Défiler vers la droite"
          onClick={() => scrollByDir(1)}
          className="absolute right-1 top-1/2 z-10 flex h-10 w-10 -translate-y-1/2 items-center justify-center rounded-full border border-line bg-white/80 text-orange shadow-md backdrop-blur-sm transition-colors hover:bg-white md:hidden"
        >
          <ChevronRight className="h-5 w-5" strokeWidth={2.4} />
        </button>
      )}
    </Reveal>
  );
}
