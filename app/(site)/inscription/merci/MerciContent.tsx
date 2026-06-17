"use client";

import { useSearchParams } from "next/navigation";
import { motion } from "framer-motion";
import { Button } from "@/components/ui/Button";

export function MerciContent() {
  const params = useSearchParams();
  const especes = params.get("mode") === "especes";
  const prenom = (params.get("prenom") ?? "").trim();

  return (
    <section className="relative flex min-h-screen items-center justify-center overflow-hidden bg-ink px-6 py-16 text-center text-white">
      <div className="grain absolute inset-0" />
      <div
        className="pointer-events-none absolute left-1/2 top-1/3 h-[36rem] w-[36rem] -translate-x-1/2 opacity-30"
        style={{
          background:
            "radial-gradient(circle, var(--color-orange), transparent 65%)",
        }}
      />
      <div className="relative max-w-xl">
        <motion.div
          initial={{ scale: 0, rotate: -20 }}
          animate={{ scale: 1, rotate: 0 }}
          transition={{ type: "spring", stiffness: 200, damping: 14 }}
          className="mx-auto flex h-20 w-20 items-center justify-center rounded-full bg-orange"
        >
          <svg viewBox="0 0 24 24" className="h-10 w-10" fill="none">
            <path
              d="M5 13l4 4L19 7"
              stroke="white"
              strokeWidth="2.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </motion.div>

        <h1 className="font-display mt-8 text-5xl font-black uppercase sm:text-6xl">
          {prenom ? `Bienvenue ${prenom} !` : "Bienvenue !"}
        </h1>
        <p className="mt-5 text-lg leading-relaxed text-white/70">
          {especes ? (
            <>
              Votre inscription est enregistrée. Votre dossier est en cours de
              validation. Pensez à régler votre cotisation en espèces auprès du
              professeur lors de votre prochain cours.
            </>
          ) : (
            <>
              Votre inscription est enregistrée et votre paiement a bien été pris
              en compte. Votre dossier est en cours de vérification, vos
              documents seront contrôlés dans les plus brefs délais.
            </>
          )}
        </p>
        <p className="mt-3 text-sm text-white/50">
          Un email de confirmation vous a été envoyé.
        </p>

        <p className="mt-6 font-display text-xl font-extrabold uppercase text-orange">
          À bientôt à la salle 🥊
        </p>

        <div className="mt-10 flex flex-col justify-center gap-3 sm:flex-row">
          <Button href="/mon-espace" variant="primary" size="lg">
            Voir mon dossier
          </Button>
          <Button href="/infos#planning" variant="ghost" size="lg">
            Voir les horaires
          </Button>
        </div>
      </div>
    </section>
  );
}
