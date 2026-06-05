import type { Metadata } from "next";
import Image from "next/image";
import { Reveal } from "@/components/ui/Reveal";
import { PageHero } from "@/components/sections/PageHero";
import { CTABanner } from "@/components/sections/CTABanner";
import { CLUB } from "@/lib/constants";

export const metadata: Metadata = {
  title: "Notre équipe pédagogique",
  description:
    "Rencontrez l'équipe du Punching Boxe : Pascal Bouchoucha, Directeur Sportif (B.E.E.S 1er degré), et ses moniteurs fédéraux et assistants.",
};

type Coach = {
  nom: string;
  badge: string; // titre du badge
  role: string; // rôle (texte orange)
  phrase: string;
  photo: string;
  objectClass?: string; // override du cadrage (object-position)
  lead?: boolean;
};

const EQUIPE: Coach[] = [
  {
    nom: CLUB.directeur,
    badge: "Directeur Sportif",
    role: "Professeur fédéral · Directeur Sportif · B.E.E.S 1er degré",
    phrase:
      "Professeur fédéral, B.E.E.S 1er degré. Fondateur et âme du club, Pascal transmet la Boxe Française avec exigence et bienveillance depuis plus de 25 ans.",
    photo: "/images/IMG_0574.jpg",
    lead: true,
  },
  {
    nom: "Benjamin",
    badge: "Moniteur fédéral",
    role: "Moniteur fédéral",
    phrase:
      "Spécialiste compétition. Entraînement technique et préparation aux assauts.",
    photo: "/images/equipe/benjamin.jpg",
    objectClass: "object-cover object-bottom",
  },
  {
    nom: "Mustapha",
    badge: "Moniteur fédéral",
    role: "Moniteur fédéral",
    phrase: "Encadrement des cours de Boxe Française adultes et enfants.",
    photo: "/images/equipe/mustapha.jpg",
  },
  {
    nom: "Renaud",
    badge: "Assistant moniteur",
    role: "Assistant moniteur",
    phrase:
      "Encadrement et accompagnement des adhérents sur les cours collectifs.",
    photo: "/images/equipe/renaud.jpg",
  },
  {
    nom: "Sébastien",
    badge: "Assistant moniteur",
    role: "Assistant moniteur",
    phrase:
      "Encadrement et accompagnement des adhérents sur les cours collectifs.",
    photo: "/images/equipe/sebastien.jpg",
    objectClass: "object-cover object-bottom",
  },
];

export default function EquipePage() {
  const [pascal, ...coachs] = EQUIPE;
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
                src={pascal.photo}
                alt={`${pascal.nom}, Directeur Sportif du Punching Boxe`}
                fill
                sizes="(max-width: 1024px) 100vw, 40vw"
                className="object-cover object-[center_30%]"
              />
            </div>
            <div className="p-8 sm:p-12">
              <span className="rounded-full bg-orange px-3 py-1 text-xs font-bold uppercase tracking-wide text-white">
                {pascal.badge}
              </span>
              <h2 className="font-display mt-5 break-words text-3xl font-extrabold uppercase text-ink sm:text-5xl">
                {pascal.nom}
              </h2>
              <p className="mt-2 font-semibold text-orange">{pascal.role}</p>
              <p className="mt-5 max-w-xl leading-relaxed text-smoke">
                {pascal.phrase}
              </p>
            </div>
          </div>
        </Reveal>

        {/* Autres coachs */}
        <div className="mt-6 grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
          {coachs.map((c, i) => (
            <Reveal key={c.nom} delay={i * 0.08}>
              <div className="card-lift h-full overflow-hidden rounded-[1.75rem] border border-line bg-white">
                <div className="relative aspect-[4/5] overflow-hidden bg-ink">
                  <Image
                    src={c.photo}
                    alt={`${c.nom}, ${c.role} du Punching Boxe`}
                    fill
                    sizes="(max-width: 640px) 100vw, 25vw"
                    className={c.objectClass ?? "object-cover object-top"}
                  />
                </div>
                <div className="p-6">
                  <span className="rounded-full bg-orange px-3 py-1 text-[0.65rem] font-bold uppercase tracking-wide text-white">
                    {c.badge}
                  </span>
                  <h3 className="font-display mt-3 break-words text-xl font-extrabold uppercase text-ink">
                    {c.nom}
                  </h3>
                  <p className="mt-1 text-sm font-semibold text-orange">
                    {c.role}
                  </p>
                  <p className="mt-3 text-sm leading-relaxed text-smoke">
                    {c.phrase}
                  </p>
                </div>
              </div>
            </Reveal>
          ))}
        </div>
      </section>

      <CTABanner title="Venez les rencontrer" />
    </>
  );
}
