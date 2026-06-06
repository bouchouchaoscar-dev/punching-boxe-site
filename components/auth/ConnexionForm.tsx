"use client";

import { useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { getAuthClient, isAuthConfigured } from "@/lib/supabase-auth";
import { ButtonAction } from "@/components/ui/Button";
import { PasswordInput } from "@/components/ui/PasswordInput";

type Tab = "signup" | "login";

export function ConnexionForm() {
  const router = useRouter();
  const params = useSearchParams();
  const message = params.get("message");
  const next = params.get("next");

  const [tab, setTab] = useState<Tab>(
    params.get("tab") === "login" ? "login" : "signup",
  );
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState("");
  const [info, setInfo] = useState("");
  const [busy, setBusy] = useState(false);

  // Mot de passe oublié (formulaire inline).
  const [resetOpen, setResetOpen] = useState(false);
  const [resetEmail, setResetEmail] = useState("");
  const [resetMsg, setResetMsg] = useState("");
  const [resetBusy, setResetBusy] = useState(false);

  const emailOk = /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email);

  async function handleReset() {
    setResetMsg("");
    if (!isAuthConfigured()) return setResetMsg("Authentification non configurée.");
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(resetEmail)) {
      return setResetMsg("Adresse email invalide.");
    }
    setResetBusy(true);
    try {
      // URL du site (prod) — jamais localhost dans l'email de réinitialisation.
      const base =
        process.env.NEXT_PUBLIC_SITE_URL ||
        (typeof window !== "undefined" ? window.location.origin : "");
      await getAuthClient().auth.resetPasswordForEmail(resetEmail, {
        redirectTo: `${base}/auth/reset-password`,
      });
    } finally {
      // Message identique que le compte existe ou non (anti-énumération).
      setResetMsg(
        "Si un compte existe avec cet email, vous recevrez un lien de réinitialisation dans quelques minutes.",
      );
      setResetBusy(false);
    }
  }

  async function handleSignup() {
    setError("");
    setInfo("");
    if (!emailOk) return setError("Adresse email invalide.");
    if (password.length < 6)
      return setError("Le mot de passe doit faire au moins 6 caractères.");
    if (password !== confirm)
      return setError("Les deux mots de passe ne correspondent pas.");
    if (!isAuthConfigured()) return setError("Authentification non configurée.");

    setBusy(true);
    try {
      const sb = getAuthClient();
      const { data, error } = await sb.auth.signUp({ email, password });
      if (error) {
        setError(
          /already registered/i.test(error.message)
            ? "Un compte existe déjà avec cet email. Connectez-vous."
            : error.message,
        );
        return;
      }
      // Email de bienvenue (best-effort, n'interrompt pas l'inscription).
      fetch("/api/account-welcome", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      }).catch(() => {});
      if (data.session) {
        router.push(next || "/inscription");
      } else {
        // Confirmation email activée côté Supabase : pas de session immédiate.
        setInfo(
          "Compte créé ! Vérifiez votre boîte mail pour confirmer votre adresse, puis connectez-vous.",
        );
        setTab("login");
      }
    } finally {
      setBusy(false);
    }
  }

  async function handleLogin() {
    setError("");
    setInfo("");
    if (!emailOk) return setError("Adresse email invalide.");
    if (!isAuthConfigured()) return setError("Authentification non configurée.");

    setBusy(true);
    try {
      const sb = getAuthClient();
      const { error } = await sb.auth.signInWithPassword({ email, password });
      if (error) {
        setError(
          /invalid login/i.test(error.message)
            ? "Email ou mot de passe incorrect."
            : /not confirmed/i.test(error.message)
              ? "Veuillez d'abord confirmer votre email (lien reçu par mail)."
              : error.message,
        );
        return;
      }
      router.push(next || "/mon-espace");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="container-px mx-auto flex min-h-[80vh] max-w-lg flex-col justify-center pt-28 pb-16">
      <div className="text-center">
        <span className="eyebrow justify-center">Espace adhérent</span>
        <h1 className="font-display mt-3 text-3xl font-extrabold uppercase text-ink sm:text-4xl">
          {tab === "signup" ? "Créez votre compte" : "Bon retour"}
        </h1>
        <p className="mt-3 text-sm text-smoke">
          {tab === "signup"
            ? "Un compte est nécessaire pour vous inscrire en ligne et suivre votre dossier."
            : "Connectez-vous pour accéder à votre espace personnel."}
        </p>
      </div>

      {message && (
        <div className="mt-6 rounded-xl border border-orange/30 bg-orange-50 p-4 text-center text-sm font-semibold text-orange">
          {message}
        </div>
      )}

      <div className="mt-8 rounded-[1.75rem] border border-line bg-white p-6 shadow-[0_24px_60px_-30px_rgba(0,0,0,0.2)] sm:p-8">
        {/* Onglets */}
        <div className="grid grid-cols-2 gap-1 rounded-full bg-paper-2 p-1">
          <TabButton active={tab === "signup"} onClick={() => setTab("signup")}>
            Créer mon compte
          </TabButton>
          <TabButton active={tab === "login"} onClick={() => setTab("login")}>
            J&apos;ai déjà un compte
          </TabButton>
        </div>

        <div className="mt-6 space-y-4">
          <Field
            label="Email"
            type="email"
            value={email}
            onChange={setEmail}
            autoComplete="email"
          />
          <Field
            label="Mot de passe"
            type="password"
            value={password}
            onChange={setPassword}
            autoComplete={tab === "signup" ? "new-password" : "current-password"}
          />
          {tab === "signup" && (
            <Field
              label="Confirmer le mot de passe"
              type="password"
              value={confirm}
              onChange={setConfirm}
              autoComplete="new-password"
            />
          )}

          {tab === "login" && (
            <div className="-mt-1">
              {!resetOpen ? (
                <button
                  type="button"
                  onClick={() => {
                    setResetOpen(true);
                    setResetEmail(email);
                    setResetMsg("");
                  }}
                  className="text-xs font-semibold text-smoke transition-colors hover:text-orange"
                >
                  Mot de passe oublié ?
                </button>
              ) : (
                <div className="rounded-xl border border-line bg-white p-4">
                  <p className="text-sm font-semibold text-ink">
                    Réinitialiser mon mot de passe
                  </p>
                  <p className="mt-1 text-sm text-smoke">
                    Saisissez votre email, nous vous enverrons un lien.
                  </p>
                  <input
                    type="email"
                    value={resetEmail}
                    onChange={(e) => setResetEmail(e.target.value)}
                    placeholder="votre@email.com"
                    autoComplete="email"
                    className="focus-ring mt-3 w-full rounded-xl border border-line bg-paper-2 px-4 py-3 text-ink outline-none transition-colors focus:border-orange"
                  />
                  {resetMsg && (
                    <p className="mt-3 text-sm font-semibold text-green-700">
                      {resetMsg}
                    </p>
                  )}
                  <div className="mt-3 flex items-center gap-4">
                    <button
                      type="button"
                      onClick={handleReset}
                      disabled={resetBusy}
                      className="rounded-full bg-orange px-5 py-2.5 text-sm font-bold text-white transition-colors hover:bg-orange/90 disabled:opacity-50"
                    >
                      {resetBusy ? "…" : "Envoyer"}
                    </button>
                    <button
                      type="button"
                      onClick={() => setResetOpen(false)}
                      className="text-sm font-semibold text-smoke transition-colors hover:text-ink"
                    >
                      Annuler
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}

          {error && (
            <p className="rounded-xl bg-red-50 p-3 text-sm font-semibold text-red-700">
              {error}
            </p>
          )}
          {info && (
            <p className="rounded-xl bg-green-50 p-3 text-sm font-semibold text-green-700">
              {info}
            </p>
          )}

          <ButtonAction
            onClick={tab === "signup" ? handleSignup : handleLogin}
            size="lg"
            className="w-full"
            disabled={busy}
          >
            {busy
              ? "…"
              : tab === "signup"
                ? "Créer mon compte"
                : "Se connecter"}
          </ButtonAction>

          <p className="text-center text-xs text-smoke">
            {tab === "signup" ? (
              <>
                Déjà inscrit ?{" "}
                <button
                  onClick={() => {
                    setTab("login");
                    setError("");
                  }}
                  className="font-bold text-orange hover:underline"
                >
                  Se connecter
                </button>
              </>
            ) : (
              <>
                Pas encore de compte ?{" "}
                <button
                  onClick={() => {
                    setTab("signup");
                    setError("");
                  }}
                  className="font-bold text-orange hover:underline"
                >
                  Créer un compte
                </button>
              </>
            )}
          </p>
        </div>
      </div>
    </section>
  );
}

function TabButton({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      className={`rounded-full px-4 py-2.5 text-sm font-bold transition-colors ${
        active ? "bg-white text-ink shadow-sm" : "text-smoke hover:text-ink"
      }`}
    >
      {children}
    </button>
  );
}

function Field({
  label,
  type,
  value,
  onChange,
  autoComplete,
}: {
  label: string;
  type: string;
  value: string;
  onChange: (v: string) => void;
  autoComplete?: string;
}) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-sm font-semibold text-ink">{label}</span>
      {type === "password" ? (
        <PasswordInput
          value={value}
          onChange={onChange}
          autoComplete={autoComplete}
        />
      ) : (
        <input
          type={type}
          value={value}
          autoComplete={autoComplete}
          onChange={(e) => onChange(e.target.value)}
          className="focus-ring w-full rounded-xl border border-line bg-paper-2 px-4 py-3 text-ink outline-none transition-colors focus:border-orange"
        />
      )}
    </label>
  );
}
