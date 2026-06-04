"use client";

import Image from "next/image";
import { motion } from "framer-motion";
import { Button, ArrowIcon } from "@/components/ui/Button";

const ease = [0.16, 1, 0.3, 1] as const;

export function Hero() {
  return (
    <section className="relative min-h-[100svh] overflow-hidden bg-ink">
      {/* Image de fond */}
      <Image
        src="/images/IMG_0558.jpg"
        alt="Entraînement de boxe française au Punching Boxe de Nogent-Le Perreux"
        fill
        priority
        sizes="100vw"
        className="object-cover object-center"
      />
      <div className="absolute inset-0 bg-gradient-to-t from-ink via-ink/70 to-ink/40" />
      <div className="absolute inset-0 bg-gradient-to-r from-ink/80 via-transparent to-transparent" />
      <div className="grain absolute inset-0" />

      {/* Halo orange */}
      <div
        className="pointer-events-none absolute -right-40 top-1/4 h-[40rem] w-[40rem] opacity-40"
        style={{
          background:
            "radial-gradient(circle, var(--color-orange), transparent 65%)",
        }}
      />

      <div className="container-px relative mx-auto flex min-h-[100svh] max-w-7xl flex-col justify-end pb-20 pt-32 sm:justify-center sm:pb-0">
        <motion.span
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.7, ease }}
          className="eyebrow text-orange"
        >
          Savate · Boxe Française · Depuis 2000
        </motion.span>

        <h1 className="font-display mt-6 max-w-4xl text-[3.25rem] font-black uppercase leading-[0.9] text-white sm:text-7xl lg:text-[6.2rem]">
          {["La Boxe Française", "au cœur du", "Val-de-Marne"].map((line, i) => (
            <motion.span
              key={line}
              initial={{ opacity: 0, y: 40 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.85, delay: 0.1 + i * 0.12, ease }}
              className="block"
            >
              {i === 2 ? (
                <span className="text-orange">{line}</span>
              ) : (
                line
              )}
            </motion.span>
          ))}
        </h1>

        <motion.p
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.7, delay: 0.55, ease }}
          className="mt-7 max-w-xl text-base leading-relaxed text-white/75 sm:text-lg"
        >
          Un club historique, 300+ adhérents, des cours pour tous les âges dès 5
          ans. Boxe Française et Savate Fitness inclus dans une seule adhésion.
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
          <Button href="/contact" variant="ghost" size="lg">
            Séance d&apos;essai gratuite
          </Button>
        </motion.div>
      </div>

      {/* Indicateur de scroll */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 1.2 }}
        className="absolute bottom-6 left-1/2 hidden -translate-x-1/2 sm:block"
      >
        <div className="flex h-10 w-6 items-start justify-center rounded-full border border-white/30 p-1.5">
          <motion.span
            animate={{ y: [0, 8, 0] }}
            transition={{ repeat: Infinity, duration: 1.6, ease: "easeInOut" }}
            className="h-1.5 w-1.5 rounded-full bg-orange"
          />
        </div>
      </motion.div>
    </section>
  );
}
