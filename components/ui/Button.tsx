import Link from "next/link";
import type { ComponentProps, ReactNode } from "react";

type Variant = "primary" | "dark" | "ghost" | "outline";
type Size = "md" | "lg";

const base =
  "group relative inline-flex items-center justify-center gap-2 rounded-full font-semibold tracking-tight transition-all duration-300 ease-[cubic-bezier(0.16,1,0.3,1)] focus-ring disabled:opacity-50 disabled:pointer-events-none";

const sizes: Record<Size, string> = {
  md: "px-6 py-3 text-sm",
  lg: "px-8 py-4 text-base",
};

const variants: Record<Variant, string> = {
  primary:
    "bg-orange text-white shadow-[0_10px_30px_-10px_rgba(255,107,0,0.7)] hover:shadow-[0_16px_40px_-12px_rgba(255,107,0,0.85)] hover:-translate-y-0.5 active:translate-y-0",
  dark: "bg-ink text-white hover:bg-ink-soft hover:-translate-y-0.5 active:translate-y-0",
  outline:
    "border border-ink text-ink bg-transparent hover:bg-ink/[0.04] hover:-translate-y-0.5 active:translate-y-0",
  ghost: "text-white border border-white/30 hover:bg-white/10 backdrop-blur",
};

type CommonProps = {
  variant?: Variant;
  size?: Size;
  children: ReactNode;
  className?: string;
};

export function Button({
  href,
  variant = "primary",
  size = "md",
  className = "",
  children,
  ...rest
}: CommonProps & { href: string } & Omit<ComponentProps<typeof Link>, "href" | "className">) {
  return (
    <Link
      href={href}
      className={`${base} ${sizes[size]} ${variants[variant]} ${className}`}
      {...rest}
    >
      {children}
    </Link>
  );
}

export function ButtonAction({
  variant = "primary",
  size = "md",
  className = "",
  children,
  ...rest
}: CommonProps & ComponentProps<"button">) {
  return (
    <button
      className={`${base} ${sizes[size]} ${variants[variant]} ${className}`}
      {...rest}
    >
      {children}
    </button>
  );
}

export function ArrowIcon({ className = "" }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      className={`h-4 w-4 transition-transform duration-300 group-hover:translate-x-1 ${className}`}
      aria-hidden
    >
      <path
        d="M5 12h14M13 6l6 6-6 6"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
