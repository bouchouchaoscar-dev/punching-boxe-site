"use client";

import Link from "next/link";
import { useState } from "react";

type Etat = "idle" | "loading" | "desinscrit" | "reabonne" | "erreur";

export function DesinscriptionClient({
  e,
  t,
  email,
}: {
  e: string;
  t: string;
  email: string;
}) {
  const [etat, setEtat] = useState<Etat>("idle");
  const [erreur, setErreur] = useState("");

  async function agir(action: "unsubscribe" | "resubscribe") {
    setEtat("loading");
    setErreur("");
    try {
      const res = await fetch("/api/desinscription", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ e, t, action }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Une erreur est survenue.");
      setEtat(action === "resubscribe" ? "reabonne" : "desinscrit");
    } catch (err) {
      setErreur(err instanceof Error ? err.message : "Erreur.");
      setEtat("erreur");
    }
  }

  // Réabonné : message final.
  if (etat === "reabonne") {
    return (
      <Carte
        titre="Vous êtes réabonné"
        emoji="✅"
        ton="success"
        texte={
          <>
            <strong className="text-ink">{email}</strong> recevra de nouveau les
            communications du Punching Boxe.
          </>
        }
      />
    );
  }

  // Désinscrit : confirmation + possibilité de se réabonner.
  if (etat === "desinscrit") {
    return (
      <Carte
        titre="Vous êtes désinscrit"
        emoji="👋"
        ton="success"
        texte={
          <>
            <strong className="text-ink">{email}</strong> ne recevra plus nos
            communications (réinscriptions, infos, actualités). Vous continuerez à
            recevoir les emails liés à votre inscription (paiements, dossier).
          </>
        }
      >
        <button
          onClick={() => agir("resubscribe")}
          className="mt-5 text-sm font-semibold text-orange underline-offset-4 hover:underline"
        >
          Me réabonner aux communications
        </button>
      </Carte>
    );
  }

  // Idle / erreur : demande de confirmation (jamais d'action au simple chargement).
  return (
    <Carte
      titre="Se désinscrire des communications"
      emoji="✉️"
      ton="neutre"
      texte={
        <>
          Vous êtes sur le point de désinscrire{" "}
          <strong className="text-ink">{email}</strong> des communications du
          Punching Boxe. Les emails liés à votre inscription (paiements, dossier)
          continueront d&apos;arriver.
        </>
      }
    >
      {erreur && (
        <p className="mt-4 rounded-xl bg-red-50 p-3 text-sm font-semibold text-red-700">
          {erreur}
        </p>
      )}
      <div className="mt-6 flex flex-col items-center gap-3">
        <button
          onClick={() => agir("unsubscribe")}
          disabled={etat === "loading"}
          className="w-full rounded-full bg-ink px-6 py-3 text-sm font-bold text-white transition-colors hover:bg-ink/90 disabled:opacity-50 sm:w-auto"
        >
          {etat === "loading" ? "…" : "Confirmer la désinscription"}
        </button>
        <Link
          href="/"
          className="text-sm font-semibold text-smoke hover:text-ink"
        >
          Annuler
        </Link>
      </div>
    </Carte>
  );
}

function Carte({
  titre,
  emoji,
  texte,
  ton,
  children,
}: {
  titre: string;
  emoji: string;
  texte: React.ReactNode;
  ton: "success" | "neutre";
  children?: React.ReactNode;
}) {
  const cls =
    ton === "success"
      ? "border-green-200 bg-green-50"
      : "border-line bg-white";
  return (
    <div className={`rounded-[1.5rem] border p-8 text-center ${cls}`}>
      <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-white text-2xl shadow-sm">
        {emoji}
      </div>
      <h1 className="font-display mt-4 text-2xl font-extrabold uppercase text-ink">
        {titre}
      </h1>
      <p className="mx-auto mt-3 max-w-md text-sm leading-relaxed text-smoke">
        {texte}
      </p>
      {children}
    </div>
  );
}
