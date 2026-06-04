"use client";

import { useState } from "react";
import { ButtonAction } from "@/components/ui/Button";

type Status = "idle" | "sending" | "ok" | "error";

export function ContactForm() {
  const [status, setStatus] = useState<Status>("idle");
  const formspreeId = process.env.NEXT_PUBLIC_FORMSPREE_ID;

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    const data = new FormData(form);

    if (!formspreeId) {
      // Pas d'ID configuré → simulation locale pour ne pas bloquer la démo.
      setStatus("ok");
      form.reset();
      return;
    }

    setStatus("sending");
    try {
      const res = await fetch(`https://formspree.io/f/${formspreeId}`, {
        method: "POST",
        body: data,
        headers: { Accept: "application/json" },
      });
      if (res.ok) {
        setStatus("ok");
        form.reset();
      } else {
        setStatus("error");
      }
    } catch {
      setStatus("error");
    }
  }

  if (status === "ok") {
    return (
      <div className="rounded-[1.5rem] border border-orange/30 bg-orange-50 p-10 text-center">
        <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-orange text-white">
          <svg viewBox="0 0 24 24" className="h-7 w-7" fill="none">
            <path
              d="M5 13l4 4L19 7"
              stroke="currentColor"
              strokeWidth="2.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </div>
        <h3 className="font-display mt-5 text-2xl font-extrabold uppercase text-ink">
          Message envoyé !
        </h3>
        <p className="mt-2 text-smoke">
          Merci, nous vous répondrons très vite. À bientôt sur les tatamis.
        </p>
        <button
          onClick={() => setStatus("idle")}
          className="mt-5 text-sm font-semibold text-orange link-underline"
        >
          Envoyer un autre message
        </button>
      </div>
    );
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="rounded-[1.5rem] border border-line bg-white p-6 sm:p-8"
    >
      <div className="grid gap-5 sm:grid-cols-2">
        <Field label="Nom complet" name="nom" required />
        <Field label="Téléphone" name="telephone" type="tel" />
        <div className="sm:col-span-2">
          <Field label="Email" name="email" type="email" required />
        </div>
        <div className="sm:col-span-2">
          <label className="block">
            <span className="mb-1.5 block text-sm font-semibold text-ink">
              Votre message <span className="text-orange">*</span>
            </span>
            <textarea
              name="message"
              required
              rows={5}
              placeholder="Bonjour, je souhaite réserver une séance d'essai…"
              className="focus-ring w-full resize-none rounded-xl border border-line bg-paper-2 px-4 py-3 text-ink outline-none transition-colors focus:border-orange"
            />
          </label>
        </div>
      </div>

      {status === "error" && (
        <p className="mt-4 text-sm font-semibold text-red-600">
          Une erreur est survenue. Réessayez ou appelez-nous directement.
        </p>
      )}

      <ButtonAction
        type="submit"
        size="lg"
        disabled={status === "sending"}
        className="mt-6 w-full sm:w-auto"
      >
        {status === "sending" ? "Envoi…" : "Envoyer mon message"}
      </ButtonAction>

      {!formspreeId && (
        <p className="mt-3 text-xs text-smoke">
          Astuce config : renseignez <code>NEXT_PUBLIC_FORMSPREE_ID</code> pour
          recevoir les messages par email.
        </p>
      )}
    </form>
  );
}

function Field({
  label,
  name,
  type = "text",
  required,
}: {
  label: string;
  name: string;
  type?: string;
  required?: boolean;
}) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-sm font-semibold text-ink">
        {label} {required && <span className="text-orange">*</span>}
      </span>
      <input
        name={name}
        type={type}
        required={required}
        className="focus-ring w-full rounded-xl border border-line bg-paper-2 px-4 py-3 text-ink outline-none transition-colors focus:border-orange"
      />
    </label>
  );
}
