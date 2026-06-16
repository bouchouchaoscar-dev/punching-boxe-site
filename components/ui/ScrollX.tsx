"use client";

import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";

// Conteneur à défilement horizontal avec flèches indicatrices (mobile) :
// flèche droite seule au début, les deux au milieu, gauche seule à la fin.
// Mécanisme factorisé (emploi du temps + tableaux admin → 1 source).
export function ScrollX({
  className = "",
  children,
}: {
  className?: string; // classes du conteneur scrollable (overflow-x-auto, marges…)
  children: ReactNode;
}) {
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

  const scrollByDir = (dir: 1 | -1) =>
    scrollRef.current?.scrollBy({ left: dir * 200, behavior: "smooth" });

  return (
    <div className="relative">
      <div ref={scrollRef} onScroll={updateArrows} className={className}>
        {children}
      </div>

      {/* Flèches — mobile uniquement */}
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
    </div>
  );
}
