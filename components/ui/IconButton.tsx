"use client";

import { type ReactNode, type ButtonHTMLAttributes } from "react";

// Bouton icône compact : le visuel peut être petit, mais la zone de tap fait
// ≥ 44px (accessibilité tactile). `variant` accent = action principale.
export function IconButton({
  icon,
  label,
  variant = "neutre",
  badge,
  className = "",
  ...rest
}: {
  icon: ReactNode;
  label: string; // aria-label obligatoire (bouton sans texte)
  variant?: "accent" | "neutre";
  badge?: ReactNode; // pastille optionnelle en haut à droite (ex. compteur)
} & ButtonHTMLAttributes<HTMLButtonElement>) {
  const styles =
    variant === "accent"
      ? "bg-orange text-white hover:brightness-95 disabled:opacity-40"
      : "border border-line bg-white text-ink hover:border-ink disabled:opacity-40";
  return (
    <button
      {...rest}
      aria-label={label}
      title={rest.title ?? label}
      className={`relative inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full transition-colors ${styles} ${className}`}
    >
      {icon}
      {badge != null && (
        <span className="absolute -right-1 -top-1 flex h-5 min-w-5 items-center justify-center rounded-full bg-orange px-1 text-[0.65rem] font-bold text-white ring-2 ring-white">
          {badge}
        </span>
      )}
    </button>
  );
}
