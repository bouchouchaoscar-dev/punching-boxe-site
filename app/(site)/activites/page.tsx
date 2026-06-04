import type { Metadata } from "next";
import Image from "next/image";
import { Reveal } from "@/components/ui/Reveal";
import { CTABanner } from "@/components/sections/CTABanner";
import { Button } from "@/components/ui/Button";
import { ACTIVITES } from "@/lib/constants";
import { PageHero } from "@/components/sections/PageHero";

export const metadata: Metadata = {
  title: "Activités — Boxe Française, Savate Fitness & Prépa Physique",
  description:
    "Découvrez nos cours : Boxe Française (Savate) et Savate Fitness inclus dans l'adhésion, plus l'option Préparation Physique. Tous niveaux, adultes et enfants.",
};

export default function ActivitesPage() {
  return (
    <>
      <PageHero
        eyebrow="Nos activités"
        title={<>Deux formules,<br /> un même tarif</>}
        intro="Choisissez votre pratique : la Boxe Française ou la Savate & Forme. Même tarif, deux orientations différentes."
      />

      <div className="container-px mx-auto max-w-7xl pb-10">
        {ACTIVITES.map((a, i) => (
          <section
            key={a.slug}
            id={a.slug}
            className="grid items-center gap-10 border-t border-line py-16 lg:grid-cols-2 lg:gap-16"
          >
            <Reveal
              className={`relative aspect-[5/4] overflow-hidden rounded-[2rem] ${
                i % 2 === 1 ? "lg:order-2" : ""
              }`}
            >
              <Image
                src={a.image}
                alt={a.titre}
                fill
                sizes="(max-width: 1024px) 100vw, 50vw"
                className="object-cover"
              />
              <span
                className={`absolute left-5 top-5 rounded-full px-4 py-1.5 text-xs font-bold uppercase tracking-wide ${
                  a.inclus ? "bg-orange text-white" : "bg-white text-ink"
                }`}
              >
                {a.tag}
              </span>
            </Reveal>

            <Reveal delay={0.1} className={i % 2 === 1 ? "lg:order-1" : ""}>
              <span className="font-display text-7xl font-black text-line">
                0{i + 1}
              </span>
              <h2 className="font-display -mt-6 text-4xl font-extrabold uppercase text-ink sm:text-5xl">
                {a.titre}
              </h2>
              <p className="mt-2 text-base font-semibold text-orange">
                {a.sousTitre}
              </p>
              <p className="mt-5 text-base leading-relaxed text-smoke sm:text-lg">
                {a.resume}
              </p>

              <ul className="mt-7 space-y-3">
                {a.points.map((p) => (
                  <li key={p} className="flex items-start gap-3 text-sm text-ink">
                    <span className="mt-1 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-orange/10">
                      <svg viewBox="0 0 24 24" className="h-3 w-3" fill="none">
                        <path
                          d="M5 13l4 4L19 7"
                          stroke="var(--color-orange)"
                          strokeWidth="3"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        />
                      </svg>
                    </span>
                    <span className="font-medium">{p}</span>
                  </li>
                ))}
              </ul>

              <div className="mt-7 flex flex-wrap gap-2">
                {a.creneaux.map((c) => (
                  <span
                    key={c}
                    className="rounded-full border border-line bg-paper-2 px-3.5 py-1.5 text-xs font-semibold text-ink"
                  >
                    {c}
                  </span>
                ))}
              </div>
            </Reveal>
          </section>
        ))}
      </div>

      <section className="container-px mx-auto max-w-7xl pb-8">
        <Reveal className="rounded-[2rem] border border-orange/20 bg-orange-50 p-8 sm:p-12">
          <h3 className="font-display text-2xl font-extrabold uppercase text-ink sm:text-3xl">
            Deux formules au choix
          </h3>
          <p className="mt-3 max-w-2xl text-smoke">
            <strong>Boxe Classique</strong> donne accès à tous les cours de Boxe
            Française (enfants &amp; adultes), avec la Préparation Physique en
            option (+100€/an). <strong>Savate &amp; Forme</strong> regroupe la
            Savate Fitness (mercredi 18h30) et la Préparation Physique, orientée
            remise en forme. Cours dispensés de septembre à fin juin, soit 10 mois
            par an.
          </p>
          <div className="mt-6">
            <Button href="/infos">
              Voir les deux formules &amp; tarifs
            </Button>
          </div>
        </Reveal>
      </section>

      <CTABanner />
    </>
  );
}
