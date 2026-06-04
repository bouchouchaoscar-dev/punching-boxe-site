"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Logo } from "@/components/ui/Logo";
import { ButtonAction } from "@/components/ui/Button";
import { setAdminSession } from "@/lib/admin-auth";

export default function AdminLoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      const res = await fetch("/api/admin/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Connexion impossible.");
      setAdminSession(true);
      router.replace("/admin");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erreur inconnue.");
      setBusy(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center px-6">
      <div className="w-full max-w-sm">
        <div className="mb-8 flex justify-center">
          <Logo />
        </div>
        <div className="rounded-[1.75rem] border border-line bg-white p-8 shadow-[0_30px_60px_-30px_rgba(0,0,0,0.2)]">
          <h1 className="font-display text-3xl font-extrabold uppercase text-ink">
            Espace admin
          </h1>
          <p className="mt-1.5 text-sm text-smoke">
            Réservé à la gestion du club.
          </p>

          <form onSubmit={submit} className="mt-6 space-y-4">
            <label className="block">
              <span className="mb-1.5 block text-sm font-semibold text-ink">
                Email
              </span>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                autoComplete="username"
                className="focus-ring w-full rounded-xl border border-line bg-paper-2 px-4 py-3 outline-none focus:border-orange"
              />
            </label>
            <label className="block">
              <span className="mb-1.5 block text-sm font-semibold text-ink">
                Mot de passe
              </span>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                autoComplete="current-password"
                className="focus-ring w-full rounded-xl border border-line bg-paper-2 px-4 py-3 outline-none focus:border-orange"
              />
            </label>

            {error && (
              <p className="rounded-xl bg-red-50 p-3 text-sm font-semibold text-red-700">
                {error}
              </p>
            )}

            <ButtonAction type="submit" size="lg" disabled={busy} className="w-full">
              {busy ? "Connexion…" : "Se connecter"}
            </ButtonAction>
          </form>
        </div>
        <Link
          href="/"
          className="mt-6 block text-center text-sm text-smoke hover:text-ink"
        >
          ← Retour au site
        </Link>
      </div>
    </div>
  );
}
