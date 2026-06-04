"use client";

import Image from "next/image";
import { motion } from "framer-motion";
import { Button, ArrowIcon } from "@/components/ui/Button";

const ease = [0.16, 1, 0.3, 1] as const;

export function Hero() {
  return (
    <section className="relative overflow-hidden bg-paper">
      {/* Halo orange très subtil en fond */}
      <div
        className="pointer-events-none absolute -left-40 top-10 h-[34rem] w-[34rem] opacity-[0.12]"
        style={{
          background:
            "radial-gradient(circle, var(--color-orange), transparent 65%)",
        }}
      />

      <div className="container-px mx-auto grid max-w-7xl items-center gap-10 pt-28 pb-16 sm:pt-32 lg:min-h-[100svh] lg:grid-cols-[1.05fr_1fr] lg:gap-16 lg:py-0">
        {/* Colonne gauche : texte */}
        <div className="relative z-10 lg:py-20">
          <motion.span
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.7, ease }}
            className="eyebrow"
          >
            Savate · Boxe Française · Depuis 2000
          </motion.span>

          <h1 className="font-display mt-6 max-w-2xl text-[3.25rem] font-black uppercase leading-[0.9] text-ink sm:text-7xl lg:text-[5.4rem]">
            {["La Boxe Française", "au cœur du", "Val-de-Marne"].map((line, i) => (
              <motion.span
                key={line}
                initial={{ opacity: 0, y: 40 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.85, delay: 0.1 + i * 0.12, ease }}
                className="block"
              >
                {i === 2 ? <span className="text-orange">{line}</span> : line}
              </motion.span>
            ))}
          </h1>

          <motion.p
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.7, delay: 0.55, ease }}
            className="mt-7 max-w-xl text-base leading-relaxed text-smoke sm:text-lg"
          >
            Un club historique, 300+ adhérents, des cours pour tous les âges dès
            5 ans. Boxe Française et Savate Fitness inclus dans une seule
            adhésion.
          </motion.p>

          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.7, delay: 0.7, ease }}
            className="mt-9 flex flex-col gap-3 sm:flex-row"
          >
            <Button href="/inscription" size="lg">
              S&apos;inscrire <ArrowIcon />
            </Button>
            <Button href="/contact" variant="outline" size="lg">
              Séance d&apos;essai gratuite
            </Button>
          </motion.div>
        </div>

        {/* Colonne droite : image */}
        <motion.div
          initial={{ opacity: 0, scale: 0.96 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 1, delay: 0.25, ease }}
          className="relative lg:h-[100svh]"
        >
          {/* Bloc orange décoratif derrière, pour la profondeur */}
          <div className="absolute -right-6 top-8 hidden h-[88%] w-3/4 rounded-[2rem] bg-orange/10 lg:block" />

          <div
            className="relative h-[22rem] w-full overflow-hidden rounded-[2rem] sm:h-[30rem] lg:h-[82vh] lg:rounded-none"
            style={{
              // Clip diagonal sur le bord gauche pour casser le rectangle (desktop)
              clipPath: "polygon(7% 0, 100% 0, 100% 100%, 0 100%)",
            }}
          >
            <Image
              src="/images/IMG_0574.jpg"
              alt="Groupe de boxeurs en garde lors d'un entraînement de boxe française au Punching Boxe"
              fill
              priority
              sizes="(max-width: 1024px) 100vw, 50vw"
              className="object-cover object-center"
            />
            {/* Léger dégradé bas pour ancrer l'image */}
            <div className="absolute inset-x-0 bottom-0 h-1/4 bg-gradient-to-t from-ink/15 to-transparent" />
          </div>

          {/* Badge flottant */}
          <div className="absolute bottom-4 left-4 rounded-2xl bg-white/95 px-5 py-3 shadow-[0_20px_40px_-20px_rgba(0,0,0,0.35)] backdrop-blur lg:bottom-10 lg:left-10">
            <p className="font-display text-3xl font-black text-ink">300+</p>
            <p className="text-xs font-semibold uppercase tracking-wide text-smoke">
              Adhérents / saison
            </p>
          </div>
        </motion.div>
      </div>
    </section>
  );
}
