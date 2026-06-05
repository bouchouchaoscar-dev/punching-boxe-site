"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { getAuthClient, isAuthConfigured } from "@/lib/supabase-auth";
import { ButtonAction } from "@/components/ui/Button";

export function ResetPasswordForm() {
  const router = useRouter();
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function handleUpdate() {
    setError("");
    if (password.length < 8)
      return setError("Le mot de passe doit faire au moins 8 caractères.");
    if (password !== confirm)
      return setError("Les deux mots de passe ne correspondent pas.");
    if (!isAuthConfigured()) return setError("Authentification non configurée.");

    setBusy(true);
    try {
      const { error } = await getAuthClient().auth.updateUser({ password });
      if (error) {
        setError(
          /session|missing|expired/i.test(error.message)
            ? "Lien expiré ou invalide. Refaites une demande de réinitialisation."
            : error.message,
        );
        return;
      }
      router.push("/mon-espace");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="container-px mx-auto flex min-h-[80vh] max-w-md flex-col justify-center pt-28 pb-16">
      <div className="text-center">
        <span className="eyebrow justify-center">Espace adhérent</span>
        <h1 className="font-display mt-3 text-3xl font-extrabold uppercase text-ink sm:text-4xl">
          Nouveau mot de passe
        </h1>
        <p className="mt-3 text-sm text-smoke">
          Choisissez un nouveau mot de passe pour votre compte.
        </p>
      </div>

      <div className="mt-8 rounded-[1.75rem] border border-line bg-white p-6 shadow-[0_24px_60px_-30px_rgba(0,0,0,0.2)] sm:p-8">
        <div className="space-y-4">
          <Field
            label="Nouveau mot de passe"
            value={password}
            onChange={setPassword}
          />
          <Field
            label="Confirmer le mot de passe"
            value={confirm}
            onChange={setConfirm}
          />

          {error && (
            <p className="rounded-xl bg-red-50 p-3 text-sm font-semibold text-red-700">
              {error}
            </p>
          )}

          <ButtonAction
            onClick={handleUpdate}
            size="lg"
            className="w-full"
            disabled={busy}
          >
            {busy ? "…" : "Mettre à jour"}
          </ButtonAction>
        </div>
      </div>
    </section>
  );
}

function Field({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-sm font-semibold text-ink">{label}</span>
      <input
        type="password"
        value={value}
        autoComplete="new-password"
        onChange={(e) => onChange(e.target.value)}
        className="focus-ring w-full rounded-xl border border-line bg-paper-2 px-4 py-3 text-ink outline-none transition-colors focus:border-orange"
      />
    </label>
  );
}
