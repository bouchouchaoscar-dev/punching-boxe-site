import Image from "next/image";
import Link from "next/link";
import { CLUB } from "@/lib/constants";

export function Logo({
  variant = "dark",
  className = "",
  gapClassName = "gap-2 sm:gap-4",
}: {
  variant?: "dark" | "light";
  className?: string;
  gapClassName?: string;
}) {
  return (
    <Link
      href="/"
      aria-label={`${CLUB.nom} — accueil`}
      className={`group inline-flex items-center ${gapClassName} ${className}`}
    >
      <span className="relative h-10 w-10 shrink-0 bg-transparent sm:h-[3.5rem] sm:w-[3.5rem]">
        <Image
          src="/logo/logo.png"
          alt={`Logo ${CLUB.nom}`}
          fill
          sizes="56px"
          className="bg-transparent object-contain"
          priority
        />
      </span>
      <span className="text-center leading-tight sm:text-left">
        <span
          className={`font-display block text-center text-sm font-extrabold uppercase tracking-tight sm:text-left sm:text-[1.15rem] ${
            variant === "light" ? "text-white" : "text-ink"
          }`}
        >
          Punching Boxe
        </span>
        <span
          className={`block text-center text-[0.6rem] font-semibold uppercase tracking-[0.06em] sm:text-left sm:text-[0.72rem] sm:tracking-[0.22em] ${
            variant === "light" ? "text-white/60" : "text-smoke"
          }`}
        >
          Nogent · Le Perreux
        </span>
      </span>
    </Link>
  );
}
