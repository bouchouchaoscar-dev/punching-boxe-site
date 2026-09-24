"use client";

import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";

// Conteneur à défilement horizontal avec flèches indicatrices (mobile) :
// flèche droite seule au début, les deux au milieu, gauche seule à la fin.
// Mécanisme factorisé (emploi du temps + tableaux admin → 1 source).
// - `chevronNu` : chevron seul (couleur accent), sans fond ni rond, avec une
//   ombre portée discrète pour rester lisible par-dessus le contenu, et une
//   zone de tap élargie invisible (sinon style rond blanc historique).
// - `onScrollEl` : expose l'élément scrollable au parent (centrage programmatique).
export function ScrollX({
  className = "",
  children,
  chevronNu = false,
  onScrollEl,
}: {
  className?: string; // classes du conteneur scrollable (overflow-x-auto, marges…)
  children: ReactNode;
  chevronNu?: boolean;
  onScrollEl?: (el: HTMLDivElement | null) => void;
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

  // Expose l'élément scrollable au parent (pour centrer une colonne, etc.).
  useEffect(() => {
    onScrollEl?.(scrollRef.current);
    return () => onScrollEl?.(null);
  }, [onScrollEl]);

  useEffect(() => {
    updateArrows();
    const el = scrollRef.current;
    if (!el) return;
    // Recalcule aussi quand le CONTENU change de taille (données chargées en
    // async, filtres) — sinon la flèche droite n'apparaît pas après le fetch.
    const ro = new ResizeObserver(updateArrows);
    ro.observe(el);
    if (el.firstElementChild) ro.observe(el.firstElementChild);
    const mo = new MutationObserver(() => {
      updateArrows();
      if (el.firstElementChild) ro.observe(el.firstElementChild);
    });
    mo.observe(el, { childList: true, subtree: true });
    window.addEventListener("resize", updateArrows);
    return () => {
      ro.disconnect();
      mo.disconnect();
      window.removeEventListener("resize", updateArrows);
    };
  }, [updateArrows]);

  const scrollByDir = (dir: 1 | -1) =>
    scrollRef.current?.scrollBy({ left: dir * 200, behavior: "smooth" });

  // Chevron nu (sans fond ni rond, zone de tap élargie invisible) OU rond blanc
  // historique. Ombre portée discrète sur le chevron nu pour rester lisible.
  const btnNu = (side: "left" | "right") =>
    `absolute top-0 bottom-0 z-10 flex w-9 items-center justify-center text-orange md:hidden ${
      side === "left" ? "left-0" : "right-0"
    }`;
  const btnRond = (side: "left" | "right") =>
    `absolute ${side === "left" ? "left-1" : "right-1"} top-1/2 z-10 flex h-10 w-10 -translate-y-1/2 items-center justify-center rounded-full border border-line bg-white/80 text-orange shadow-md backdrop-blur-sm transition-colors hover:bg-white md:hidden`;
  const iconCls = chevronNu
    ? "h-6 w-6 [filter:drop-shadow(0_1px_1.5px_rgba(0,0,0,0.45))]"
    : "h-5 w-5";

  return (
    <div className="relative">
      <div ref={scrollRef} onScroll={updateArrows} className={className}>
        {children}
      </div>

      {canLeft && (
        <button
          type="button"
          aria-label="Jour précédent"
          onClick={() => scrollByDir(-1)}
          className={chevronNu ? btnNu("left") : btnRond("left")}
        >
          <ChevronLeft className={iconCls} strokeWidth={chevronNu ? 2.6 : 2.4} />
        </button>
      )}
      {canRight && (
        <button
          type="button"
          aria-label="Jour suivant"
          onClick={() => scrollByDir(1)}
          className={chevronNu ? btnNu("right") : btnRond("right")}
        >
          <ChevronRight className={iconCls} strokeWidth={chevronNu ? 2.6 : 2.4} />
        </button>
      )}
    </div>
  );
}
