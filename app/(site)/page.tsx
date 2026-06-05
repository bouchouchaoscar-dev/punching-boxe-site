import Image from "next/image";
import Link from "next/link";
import { Hero } from "@/components/home/Hero";
import { Marquee } from "@/components/home/Marquee";
import { Reveal } from "@/components/ui/Reveal";
import { Counter } from "@/components/ui/Counter";
import { SectionHeading } from "@/components/ui/SectionHeading";
import { CTABanner } from "@/components/sections/CTABanner";
import { Button, ArrowIcon } from "@/components/ui/Button";
import { FormulesCards } from "@/components/home/FormulesCards";
import { ACTIVITES, POURQUOI, STATS } from "@/lib/constants";

export default function HomePage() {
  return (
    <>
      <Hero />
      <Marquee />

      {/* ---------- Chiffres clés ---------- */}
      <section className="container-px mx-auto max-w-7xl py-16">
        <div className="grid gap-y-12 sm:grid-cols-2 lg:grid-cols-4">
          {STATS.map((s, i) => (
            <Reveal
              key={s.label}
              delay={i * 0.08}
              className="border-l-2 border-orange pl-6"
            >
              <div className="font-display text-6xl font-black text-ink sm:text-7xl">
                <Counter to={s.value} suffix={s.suffix} />
              </div>
              <p className="mt-2 text-sm font-semibold uppercase tracking-wide text-smoke">
                {s.label}
              </p>
            </Reveal>
          ))}
        </div>
      </section>

      {/* ---------- Présentation ---------- */}
      <section className="container-px mx-auto max-w-7xl pb-16">
        <div className="grid items-center gap-12 lg:grid-cols-2 lg:gap-20">
          <Reveal className="relative aspect-[4/5] overflow-hidden rounded-[2rem]">
            <Image
              src="/images/IMG_0521.jpg"
              alt="Cours enfants de boxe française"
              fill
              sizes="(max-width: 1024px) 100vw, 50vw"
              className="object-cover"
            />
            <div className="absolute bottom-5 left-5 rounded-2xl bg-white/90 px-5 py-4 backdrop-blur">
              <p className="font-display text-3xl font-black text-ink">2000</p>
              <p className="text-xs font-semibold uppercase tracking-wide text-smoke">
                Année de création
              </p>
            </div>
          </Reveal>

          <div>
            <SectionHeading
              eyebrow="Le club"
              title={<>Un esprit d&apos;équipe, une frappe nette</>}
              intro="Né en 2000 de la fusion de deux clubs locaux, le Punching Boxe de Nogent-Le Perreux fait vivre la Savate sur 4 salles d'entraînement. Femmes, hommes, enfants : plus de 200 adhérents partagent chaque saison la même passion."
            />
            <div className="mt-8 grid gap-4 sm:grid-cols-2">
              {POURQUOI.map((p, i) => (
                <Reveal
                  key={p.titre}
                  delay={i * 0.06}
                  className="rounded-2xl border border-line p-5"
                >
                  <h3 className="font-display text-lg font-extrabold uppercase text-ink">
                    {p.titre}
                  </h3>
                  <p className="mt-2 text-sm leading-relaxed text-smoke">
                    {p.texte}
                  </p>
                </Reveal>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* ---------- Aperçu activités ---------- */}
      <section className="bg-paper-2 py-16">
        <div className="container-px mx-auto max-w-7xl">
          <SectionHeading
            eyebrow="Nos activités"
            title={<>Trois façons de transpirer</>}
            intro="Deux formules au choix : Boxe Française ou Savate & Forme — choisissez votre voie."
          />

          <div className="mt-14 grid gap-6 lg:grid-cols-3">
            {ACTIVITES.map((a, i) => (
              <Reveal key={a.slug} delay={i * 0.1} className="h-full">
                <Link
                  href="/activites"
                  className="card-lift group flex h-full flex-col overflow-hidden rounded-[1.75rem] border border-line bg-white"
                >
                  <div className="relative aspect-[4/3] overflow-hidden">
                    <Image
                      src={a.image}
                      alt={a.titre}
                      fill
                      sizes="(max-width: 1024px) 100vw, 33vw"
                      className="object-cover transition-transform duration-700 group-hover:scale-105"
                    />
                    <div className="absolute inset-0 bg-gradient-to-t from-ink/50 to-transparent" />
                    <span className="absolute left-4 top-4 rounded-full bg-orange px-3 py-1 text-xs font-bold uppercase tracking-wide text-white">
                      {a.tag}
                    </span>
                  </div>
                  <div className="flex flex-1 flex-col p-6">
                    <h3 className="font-display text-2xl font-extrabold uppercase text-ink">
                      {a.titre}
                    </h3>
                    <p className="mt-1 text-sm font-semibold text-orange">
                      {a.sousTitre}
                    </p>
                    <p className="mt-3 flex-1 text-sm leading-relaxed text-smoke">
                      {a.resume}
                    </p>
                    <span className="mt-5 inline-flex items-center gap-1.5 text-sm font-bold text-ink">
                      Découvrir <ArrowIcon />
                    </span>
                  </div>
                </Link>
              </Reveal>
            ))}
          </div>

          <div className="mt-12 text-center">
            <Button href="/activites" variant="dark" size="lg">
              Voir toutes les activités <ArrowIcon />
            </Button>
          </div>
        </div>
      </section>

      {/* ---------- Deux formules ---------- */}
      <section className="container-px mx-auto max-w-7xl pt-8 pb-12">
        <SectionHeading
          eyebrow="Deux formules"
          title={<>Choisissez votre voie</>}
          intro="Deux orientations : la pratique de la boxe, ou la remise en forme par la savate. À chacun sa formule."
        />
        <div className="mt-12">
          <FormulesCards />
        </div>
      </section>

      {/* ---------- Vidéo de présentation ---------- */}
      <section className="container-px mx-auto max-w-7xl pb-4">
        <Reveal className="mx-auto max-w-[800px] text-center">
          <span className="eyebrow justify-center">Le club en vidéo</span>
          <p className="mt-3 text-smoke">
            Pascal Bouchoucha présente le Punching Boxe de Nogent-Le Perreux
          </p>
          <div className="mt-5 aspect-video overflow-hidden rounded-xl shadow-[0_20px_50px_-20px_rgba(0,0,0,0.3)]">
            <iframe
              src="https://www.youtube-nocookie.com/embed/baOTRFpSw7k"
              title="Pascal Bouchoucha présente le Punching Boxe de Nogent-Le Perreux"
              className="h-full w-full"
              loading="lazy"
              allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
              allowFullScreen
            />
          </div>
        </Reveal>
      </section>

      <CTABanner />
    </>
  );
}
