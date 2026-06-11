import Image from "next/image";
import { PageHero } from "@/components/sections/PageHero";
import { CTABanner } from "@/components/sections/CTABanner";
import { Reveal } from "@/components/ui/Reveal";
import { Counter } from "@/components/ui/Counter";
import { ACTIVITES, STATS, CLUB } from "@/lib/constants";
import { pageMeta } from "@/lib/seo";

export const metadata = pageMeta({
  title:
    "À propos | Club de Boxe Française à Nogent-sur-Marne depuis 2000 - Punching Boxe",
  description:
    "Le Punching Boxe de Nogent-Le Perreux : club de boxe française, savate et préparation physique depuis 2000. 200+ adhérents, 4 salles à Nogent-sur-Marne, Le Perreux et dans le Val-de-Marne (94). Gestion moderne, inscription 100% en ligne.",
  path: "/a-propos",
  image: "/images/IMG_0558.jpg",
});

export default function AProposPage() {
  return (
    <>
      <PageHero
        eyebrow="Le club"
        title={<>À propos du Punching Boxe</>}
        intro="Club de Boxe Française et Savate au cœur du Val-de-Marne, à Nogent-sur-Marne et Le Perreux-sur-Marne, depuis 2000."
      />

      {/* Histoire */}
      <section className="container-px mx-auto max-w-7xl pt-12 pb-8">
        <div className="grid items-center gap-12 lg:grid-cols-2 lg:gap-20">
          <Reveal className="relative aspect-[4/5] overflow-hidden rounded-[2rem]">
            <Image
              src="/images/IMG_0558.jpg"
              alt="Cours de Boxe Française au Punching Boxe de Nogent-Le Perreux"
              fill
              sizes="(max-width: 1024px) 100vw, 50vw"
              className="object-cover"
            />
          </Reveal>
          <div>
            <span className="eyebrow">Notre histoire</span>
            <h2 className="font-display mt-3 break-words text-3xl font-extrabold uppercase text-ink sm:text-4xl">
              Plus de 25 ans de passion
            </h2>
            <div className="mt-5 space-y-4 leading-relaxed text-smoke">
              <p>
                Né en 2000 de la fusion de deux clubs locaux, le {CLUB.nom} fait
                vivre la Boxe Française et la Savate dans le Val-de-Marne depuis
                plus de 25 ans. Association loi 1901, le club est animé par une
                équipe pédagogique fédéralement diplômée.
              </p>
              <p>
                Femmes, hommes et enfants, plus de 200 adhérents partagent
                chaque saison la même passion, du débutant au compétiteur. Ici
                la boxe est accessible à tous : débutants bienvenus, à tout âge
                et à tout niveau. Le club transmet la Boxe Française avec exigence
                et bienveillance, dans un véritable esprit d&apos;équipe.
              </p>
              <p>
                Fidèle à ses valeurs mais résolument moderne, le club est aussi
                passé au tout numérique : inscription, paiement et espace
                adhérent personnel se font désormais <strong>100% en ligne</strong>,
                en quelques minutes — une gestion dématérialisée, sans paperasse.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Chiffres clés */}
      <section className="bg-paper-2 py-16">
        <div className="container-px mx-auto max-w-7xl">
          <Reveal>
            <span className="eyebrow">En chiffres</span>
            <h2 className="font-display mt-3 break-words text-3xl font-extrabold uppercase text-ink sm:text-4xl">
              Le club aujourd&apos;hui
            </h2>
          </Reveal>
          <div className="mt-10 grid gap-y-12 sm:grid-cols-2 lg:grid-cols-4">
            {STATS.map((s, i) => (
              <Reveal
                key={s.label}
                delay={i * 0.08}
                className="border-l-2 border-orange pl-6"
              >
                <div className="font-display text-5xl font-black text-ink sm:text-6xl">
                  <Counter to={s.value} suffix={s.suffix} />
                </div>
                <p className="mt-2 text-sm font-semibold uppercase tracking-wide text-smoke">
                  {s.label}
                </p>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      {/* Disciplines */}
      <section className="container-px mx-auto max-w-7xl py-16">
        <Reveal>
          <span className="eyebrow">Nos disciplines</span>
          <h2 className="font-display mt-3 break-words text-3xl font-extrabold uppercase text-ink sm:text-4xl">
            Ce que l&apos;on pratique
          </h2>
        </Reveal>
        <div className="mt-10 grid gap-6 lg:grid-cols-3">
          {ACTIVITES.map((a, i) => (
            <Reveal key={a.slug} delay={i * 0.08}>
              <div className="h-full rounded-[1.5rem] border border-line bg-white p-6">
                <h3 className="font-display text-xl font-extrabold uppercase text-ink">
                  {a.titre}
                </h3>
                <p className="mt-2 text-sm leading-relaxed text-smoke">
                  {a.resume}
                </p>
              </div>
            </Reveal>
          ))}
        </div>
      </section>

      {/* Zone géographique */}
      <section className="bg-paper-2 py-16">
        <div className="container-px mx-auto max-w-3xl text-center">
          <Reveal>
            <span className="eyebrow justify-center">Zone couverte</span>
            <h2 className="font-display mt-3 break-words text-3xl font-extrabold uppercase text-ink sm:text-4xl">
              Nogent, Le Perreux et le Val-de-Marne
            </h2>
            <p className="mx-auto mt-5 max-w-2xl leading-relaxed text-smoke">
              Le club rayonne sur <strong>Nogent-sur-Marne (94130)</strong> et{" "}
              <strong>Le Perreux-sur-Marne (94170)</strong>, et accueille les
              pratiquants de tout le <strong>Val-de-Marne (94)</strong> et de
              l&apos;est parisien. Les entraînements se déroulent sur 4 salles :
              Gymnase du Port, Gymnase des Ormes, Gymnase du Centre et Dojo David
              Douillet.
            </p>
          </Reveal>
        </div>
      </section>

      <CTABanner title="Venez nous rencontrer" />
    </>
  );
}
