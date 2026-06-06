import Image from "next/image";
import Link from "next/link";
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
      <span className="whitespace-nowrap text-center leading-tight sm:text-left">
        <span
          className={`font-display block whitespace-nowrap text-center font-extrabold uppercase tracking-tight sm:text-left ${
            small ? "text-sm" : "text-sm sm:text-[1.15rem]"
          } ${variant === "light" ? "text-white" : "text-ink"}`}
        >
          Punching Boxe
        </span>
        <span
          className={`block whitespace-nowrap text-center font-semibold uppercase sm:text-left ${
            small
              ? "text-xs tracking-tight"
              : "text-[0.6rem] tracking-[0.06em] sm:text-[0.72rem] sm:tracking-[0.22em]"
          } ${variant === "light" ? "text-white/60" : "text-smoke"}`}
        >
          Nogent · Le Perreux
        </span>
      </span>
    </Link>
  );
}
