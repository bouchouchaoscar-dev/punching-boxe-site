import type { Metadata } from "next";
import Image from "next/image";
import { Reveal } from "@/components/ui/Reveal";
import { PageHero } from "@/components/sections/PageHero";
import { CTABanner } from "@/components/sections/CTABanner";
import { CLUB } from "@/lib/constants";

export const metadata: Metadata = {
  title: "Notre équipe pédagogique",
  description:
    "Rencontrez l'équipe du Punching Boxe : Pascal Bouchoucha, Directeur Sportif (Professeur fédéral, B.E.E.S 1er degré) et ses moniteurs fédéraux.",
};

type Coach = {
  nom: string;
  titre: string;
  phrase: string;
  lead?: boolean;
  initiales: string;
};

const EQUIPE: Coach[] = [
  {
    nom: CLUB.directeur,
    titre: "Directeur Sportif",
    phrase:
      "Professeur fédéral, B.E.E.S 1er degré. Fondateur et âme du club, Pascal transmet la Boxe Française avec exigence et bienveillance depuis plus de 25 ans.",
    lead: true,
    initiales: "PB",
  },
  {
    nom: "Nom à venir",
    titre: "Moniteur fédéral",
    phrase: "Encadrement des cours adultes et compétiteurs.",
    initiales: "?",
  },
  {
    nom: "Nom à venir",
    titre: "Monitrice fédérale",
    phrase: "Cours enfants et Savate Fitness.",
    initiales: "?",
  },
  {
    nom: "Nom à venir",
    titre: "Coach préparation physique",
    phrase: "Renforcement musculaire et conditionnement.",
    initiales: "?",
  },
];

export default function EquipePage() {
  return (
    <>
      <PageHero
        eyebrow="L'équipe"
        title={<>Nos professeurs</>}
        intro="Une équipe pédagogique diplômée et passionnée, fédéralement formée, au service de votre progression — quel que soit votre niveau."
      />

      <section className="container-px mx-auto max-w-7xl pt-12 pb-8">
        {/* Coach principal */}
        <Reveal className="card-lift overflow-hidden rounded-[2rem] border border-line bg-white">
          <div className="grid lg:grid-cols-[0.9fr_1.4fr]">
            <div className="relative min-h-[18rem] overflow-hidden bg-ink">
              <Image
                src="/images/IMG_0574.jpg"
                alt={`${EQUIPE[0].nom}, Directeur Sportif du Punching Boxe`}
                fill
                sizes="(max-width: 1024px) 100vw, 40vw"
                className="object-cover object-[center_30%]"
              />
            </div>
            <div className="p-8 sm:p-12">
              <span className="rounded-full bg-orange px-3 py-1 text-xs font-bold uppercase tracking-wide text-white">
                Directeur Sportif
              </span>
              <h2 className="font-display mt-5 text-4xl font-extrabold uppercase text-ink sm:text-5xl">
                {EQUIPE[0].nom}
              </h2>
              <p className="mt-2 font-semibold text-orange">
                {CLUB.directeurTitre}
              </p>
              <p className="mt-5 max-w-xl leading-relaxed text-smoke">
                {EQUIPE[0].phrase}
              </p>
            </div>
          </div>
        </Reveal>

        {/* Autres coachs */}
        <div className="mt-6 grid gap-6 sm:grid-cols-3">
          {EQUIPE.slice(1).map((c, i) => (
            <Reveal key={i} delay={i * 0.08}>
              <div className="card-lift h-full rounded-[1.75rem] border border-line bg-white p-7 text-center">
                <div className="relative mx-auto flex h-24 w-24 items-center justify-center overflow-hidden rounded-full bg-paper-2">
                  <span className="font-display text-3xl font-black text-line">
                    {c.initiales}
                  </span>
                </div>
                <h3 className="font-display mt-5 text-xl font-extrabold uppercase text-ink">
                  {c.nom}
                </h3>
                <p className="mt-1 text-sm font-semibold text-orange">{c.titre}</p>
                <p className="mt-3 text-sm leading-relaxed text-smoke">
                  {c.phrase}
                </p>
              </div>
            </Reveal>
          ))}
        </div>

        <p className="mt-8 text-center text-sm text-smoke">
          Les photos et noms des moniteurs seront ajoutés prochainement.
        </p>
      </section>

      <CTABanner title="Venez les rencontrer" />
    </>
  );
}
