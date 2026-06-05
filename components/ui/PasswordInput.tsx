"use client";

import { useState } from "react";
import { Eye, EyeOff } from "lucide-react";

/**
 * Champ mot de passe avec bascule afficher/masquer (icône œil).
 * Reprend le style standard des inputs du site.
 */
export function PasswordInput({
  value,
  onChange,
  autoComplete,
  name,
  required,
  placeholder,
  className,
}: {
  value: string;
  onChange: (v: string) => void;
  autoComplete?: string;
  name?: string;
  required?: boolean;
  placeholder?: string;
  className?: string;
}) {
  const [show, setShow] = useState(false);
  return (
    <div className="relative">
      <input
        type={show ? "text" : "password"}
        value={value}
        name={name}
        required={required}
        placeholder={placeholder}
        autoComplete={autoComplete}
        onChange={(e) => onChange(e.target.value)}
        className={
          className ??
          "focus-ring w-full rounded-xl border border-line bg-paper-2 px-4 py-3 pr-11 text-ink outline-none transition-colors focus:border-orange"
        }
      />
      <button
        type="button"
        onClick={() => setShow((s) => !s)}
        aria-label={show ? "Masquer le mot de passe" : "Afficher le mot de passe"}
        className="absolute inset-y-0 right-0 flex w-11 items-center justify-center text-smoke transition-colors hover:text-orange"
      >
        {show ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
      </button>
    </div>
  );
}
