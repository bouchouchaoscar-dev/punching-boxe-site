"use client";

import { useState } from "react";
import { ButtonAction } from "@/components/ui/Button";

type Status = "idle" | "sending" | "error";

export function ContactForm() {
  const [status, setStatus] = useState<Status>("idle");
  const [toast, setToast] = useState<string | null>(null);
  // Anti-bot : honeypot (champ piège) + horodatage de montage du formulaire.
  // La décision finale se prend CÔTÉ SERVEUR ; ces valeurs sont juste transmises.
  const [honeypot, setHoneypot] = useState("");
  const [formLoadedAt] = useState(() => Date.now());

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    const data = new FormData(form);
    const payload = {
      nom: String(data.get("nom") || ""),
      email: String(data.get("email") || ""),
      telephone: String(data.get("telephone") || ""),
      message: String(data.get("message") || ""),
      website: honeypot,
      formLoadedAt,
    };

    setStatus("sending");
    try {
      const res = await fetch("/api/contact", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (res.ok) {
        setStatus("idle");
        form.reset();
        setToast("Message envoyé ✓ — nous vous répondrons très vite !");
        window.setTimeout(() => setToast(null), 4000);
      } else {
        setStatus("error");
      }
    } catch {
      setStatus("error");
    }
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="rounded-[1.5rem] border border-line bg-white p-6 sm:p-8"
    >
      {/* Piège anti-bot : invisible et inatteignable au clavier pour un humain,
          rempli uniquement par les bots. Ne jamais retirer. */}
      <div
        aria-hidden="true"
        style={{
          position: "absolute",
          left: "-9999px",
          width: "1px",
          height: "1px",
          opacity: 0,
          overflow: "hidden",
        }}
      >
        <label>
          Ne remplissez pas ce champ
          <input
            type="text"
            name="website"
            tabIndex={-1}
            autoComplete="off"
            aria-hidden="true"
            value={honeypot}
            onChange={(e) => setHoneypot(e.target.value)}
          />
        </label>
      </div>

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

      {toast && (
        <div className="fixed bottom-6 right-6 z-50 max-w-xs rounded-xl bg-ink px-5 py-3 text-sm font-bold text-white shadow-lg">
          {toast}
        </div>
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
