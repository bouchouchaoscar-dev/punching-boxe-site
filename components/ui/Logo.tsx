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
      className={`group inline-flex items-center gap-4 ${className}`}
    >
      <span className="relative h-[3.25rem] w-[3.25rem] shrink-0 bg-transparent sm:h-[3.5rem] sm:w-[3.5rem]">
        <Image
          src="/logo/logo.png"
          alt={`Logo ${CLUB.nom}`}
          fill
          sizes="56px"
          className="bg-transparent object-contain"
          priority
        />
      </span>
      <span className="leading-tight">
        <span
          className={`font-display block text-[1.15rem] font-extrabold uppercase tracking-tight ${
            variant === "light" ? "text-white" : "text-ink"
          }`}
        >
          Punching Boxe
        </span>
        <span
          className={`block text-[0.72rem] font-semibold uppercase tracking-[0.22em] ${
            variant === "light" ? "text-white/60" : "text-smoke"
          }`}
        >
          Nogent · Le Perreux
        </span>
      </span>
    </Link>
  );
}
