"use client";

import { useSearchParams } from "next/navigation";
import { motion } from "framer-motion";
import { Button } from "@/components/ui/Button";
import { CLUB } from "@/lib/constants";

export function MerciContent() {
  const params = useSearchParams();
  const especes = params.get("mode") === "especes";

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
          Bienvenue !
        </h1>
        <p className="mt-5 text-lg leading-relaxed text-white/70">
          Votre inscription au {CLUB.nom} est enregistrée. Un email de
          confirmation vous a été envoyé.
        </p>

        {especes && (
          <p className="mt-4 rounded-2xl border border-orange/30 bg-white/5 p-4 text-sm text-white/80">
            Pensez à régler en espèces auprès du professeur lors de votre
            prochain cours. Votre place est notée comme « en attente » d&apos;ici là.
          </p>
        )}

        <p className="mt-6 font-display text-xl font-extrabold uppercase text-orange">
          À bientôt sur les tatamis 🥊
        </p>

        <div className="mt-10 flex flex-col justify-center gap-3 sm:flex-row">
          <Button href="/" variant="primary" size="lg">
            Retour à l&apos;accueil
          </Button>
          <Button href="/infos" variant="ghost" size="lg">
            Voir les horaires
          </Button>
        </div>
      </div>
    </section>
  );
}
