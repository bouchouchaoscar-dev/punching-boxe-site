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
      // Largeurs INTRINSÈQUES (les spans sont en w-max → jamais étirés).
      const wt = top.getBoundingClientRect().width; // "Punching Boxe"
      const w0 = bot.getBoundingClientRect().width; // "Nogent · Le Perreux" naturel
      const n = (bot.textContent ?? "").length;
      if (n < 2 || wt <= w0) return;
      // letter-spacing s'ajoute après chaque lettre : bord droit = w0 + (n-1)·ls.
      const ls = (wt - w0) / (n - 1);
      bot.style.letterSpacing = `${ls}px`;
      bot.style.marginRight = `-${ls}px`; // retire l'espacement résiduel de fin
    };

    // rAF : on attend que le layout soit posé avant de mesurer.
    const raf = requestAnimationFrame(fit);
    const ro = new ResizeObserver(fit);
    ro.observe(top); // top ne change pas via fit → pas de boucle
    window.addEventListener("resize", fit);
    const fonts = (document as Document & { fonts?: { ready?: Promise<unknown> } }).fonts;
    fonts?.ready?.then(fit);

    return () => {
      cancelAnimationFrame(raf);
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
          className={`font-display block w-max whitespace-nowrap font-extrabold uppercase tracking-tight ${
            small ? "text-sm" : "text-sm sm:text-[1.15rem]"
          } ${variant === "light" ? "text-white" : "text-ink"}`}
        >
          Punching Boxe
        </span>
        <span
          ref={botRef}
          className={`block w-max whitespace-nowrap font-semibold uppercase ${
            small ? "text-xs" : "text-[0.66rem] sm:text-[0.8rem]"
          } ${variant === "light" ? "text-white/60" : "text-smoke"}`}
        >
          Nogent · Le Perreux
        </span>
      </span>
    </Link>
  );
}
