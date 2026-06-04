import Image from "next/image";
import Link from "next/link";
import { CLUB } from "@/lib/constants";

export function Logo({
  variant = "dark",
  className = "",
}: {
  variant?: "dark" | "light";
  className?: string;
}) {
  return (
    <Link
      href="/"
      aria-label={`${CLUB.nom} — accueil`}
      className={`group inline-flex items-center gap-2.5 ${className}`}
    >
      <span className="relative h-10 w-10 shrink-0 overflow-hidden rounded-xl bg-ink ring-1 ring-black/5 sm:h-11 sm:w-11">
        <Image
          src="/logo/logo.png"
          alt={`Logo ${CLUB.nom}`}
          fill
          sizes="44px"
          className="object-contain p-0.5"
          priority
        />
      </span>
      <span className="leading-none">
        <span
          className={`font-display block text-[0.95rem] font-extrabold uppercase tracking-tight ${
            variant === "light" ? "text-white" : "text-ink"
          }`}
        >
          Punching Boxe
        </span>
        <span
          className={`block text-[0.6rem] font-semibold uppercase tracking-[0.22em] ${
            variant === "light" ? "text-white/60" : "text-smoke"
          }`}
        >
          Nogent · Le Perreux
        </span>
      </span>
    </Link>
  );
}
