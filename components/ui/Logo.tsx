"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useRef } from "react";
import { CLUB } from "@/lib/constants";

export function Logo({
  variant = "dark",
  className = "",
  gapClassName = "gap-2 sm:gap-4",
  size = "default",
}: {
  variant?: "dark" | "light";
  className?: string;
  gapClassName?: string;
  size?: "default" | "sm";
}) {
  const small = size === "sm";
  const topRef = useRef<HTMLSpanElement>(null);
  const botRef = useRef<HTMLSpanElement>(null);

  // Cale "Nogent · Le Perreux" sur la largeur EXACTE de "Punching Boxe" via un
  // letter-spacing UNIFORME calculé (espaces de mots normaux, pas d'étirement).
  // Recalcul à chaque resize + au chargement des polices, sur desktop et mobile.
  useEffect(() => {
    const top = topRef.current;
    const bot = botRef.current;
    if (!top || !bot) return;

    const fit = () => {
      bot.style.letterSpacing = "0px";
      bot.style.marginRight = "0px";
      const wt = top.getBoundingClientRect().width; // largeur ligne du haut
      const w0 = bot.getBoundingClientRect().width; // largeur naturelle ligne du bas
      const n = (bot.textContent ?? "").length;
      if (n < 2 || wt <= w0) return; // déjà aussi large : espacement normal
      // letter-spacing s'ajoute APRÈS chaque lettre : le bord droit visible du
      // dernier glyphe = w0 + (n-1)·ls. On résout pour qu'il tombe pile à wt.
      const ls = (wt - w0) / (n - 1);
      bot.style.letterSpacing = `${ls}px`;
      // On retire l'espacement résiduel ajouté après la DERNIÈRE lettre
      // (sinon la boîte dépasse de `ls` à droite, sans glyphe visible).
      bot.style.marginRight = `-${ls}px`;
    };

    fit();
    const ro = new ResizeObserver(fit);
    ro.observe(top);
    window.addEventListener("resize", fit);
    const fonts = (document as Document & { fonts?: { ready?: Promise<unknown> } }).fonts;
    fonts?.ready?.then(fit);

    return () => {
      ro.disconnect();
      window.removeEventListener("resize", fit);
    };
  }, [variant, size]);

  return (
    <Link
      href="/"
      aria-label={`${CLUB.nom} — accueil`}
      className={`group inline-flex items-center ${
        small ? "min-w-0" : ""
      } ${gapClassName} ${className}`}
    >
      <span
        className={`relative shrink-0 bg-transparent ${
          small ? "h-8 w-8" : "h-10 w-10 sm:h-[3.5rem] sm:w-[3.5rem]"
        }`}
      >
        <Image
          src="/logo/logo.png"
          alt={`Logo ${CLUB.nom}`}
          fill
          sizes="56px"
          className="bg-transparent object-contain"
          priority
        />
      </span>
      <span className="inline-flex flex-col items-start leading-tight">
        <span
          ref={topRef}
          className={`font-display block whitespace-nowrap font-extrabold uppercase tracking-tight ${
            small ? "text-sm" : "text-sm sm:text-[1.15rem]"
          } ${variant === "light" ? "text-white" : "text-ink"}`}
        >
          Punching Boxe
        </span>
        <span
          ref={botRef}
          className={`block whitespace-nowrap font-semibold uppercase ${
            small ? "text-xs" : "text-[0.6rem] sm:text-[0.72rem]"
          } ${variant === "light" ? "text-white/60" : "text-smoke"}`}
        >
          Nogent · Le Perreux
        </span>
      </span>
    </Link>
  );
}
