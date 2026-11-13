import Image from "next/image";
import { Reveal } from "@/components/ui/Reveal";
import { PageHero } from "@/components/sections/PageHero";
import { CTABanner } from "@/components/sections/CTABanner";
import { CLUB } from "@/lib/constants";
import { pageMeta } from "@/lib/seo";

export const metadata = pageMeta({
  title:
    "Notre Équipe | Professeurs et Moniteurs Fédéraux - Punching Boxe Nogent",
  description:
    "Pascal Bouchoucha, Directeur Sportif et Professeur Fédéral, et son équipe de moniteurs fédéraux encadrent vos cours de Boxe Française et Savate.",
  path: "/equipe",
  image: "/images/IMG_0574.jpg",
});

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
    photo: "/images/equipe/pascal.jpg",
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
    objectClass: "object-cover object-[83%_center] scale-150",
  },
  {
    nom: "Killian",
    badge: "Assistant moniteur",
    role: "Assistant moniteur",
    phrase:
      "Encadrement et accompagnement des adhérents sur les cours collectifs.",
    photo: "/images/equipe/killian.jpg",
  },
  {
    nom: "Nicolas",
    badge: "Assistant moniteur",
    role: "Assistant moniteur",
    phrase:
      "Encadrement et accompagnement des adhérents sur les cours collectifs.",
    photo: "/images/equipe/nicolas.jpg",
  },
];

export default function EquipePage() {
  const [pascal, ...coachs] = EQUIPE;
  // Hiérarchie : Pascal en tête, puis la ligne des moniteurs fédéraux, puis la
  // ligne des assistants moniteurs. Chaque ligne est centrée, cartes à largeur FIXE
  // (plus petites que Pascal) → toutes les photos des coachs ont la même taille.
  const moniteurs = coachs.filter((c) => c.badge === "Moniteur fédéral");
  const assistants = coachs.filter((c) => c.badge === "Assistant moniteur");
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
          <div className="grid lg:grid-cols-[0.6fr_1.4fr] lg:items-center">
            {/* Photo en format PORTRAIT (4/5, type Instagram) : selfie non
                écrasé sur desktop + tête visible sur mobile. object-position
                légèrement vers le haut (mobile) pour garantir la tête. */}
            <div className="relative aspect-[4/5] w-full overflow-hidden bg-ink lg:max-h-[34rem]">
              <Image
                src={pascal.photo}
                alt={`${pascal.nom}, Directeur Sportif du Punching Boxe`}
                fill
                sizes="(max-width: 1024px) 100vw, 30vw"
                className="object-cover object-[center_20%] lg:object-[center_35%]"
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

        {/* Ligne des moniteurs fédéraux, puis ligne des assistants moniteurs.
            Cartes à largeur FIXE et rangées centrées : photos égales et plus petites
            que celle de Pascal (mis en avant), même seul sur sa ligne. */}
        <div className="mt-6 flex flex-wrap justify-center gap-6">
          {moniteurs.map((c, i) => (
            <CoachCard key={c.nom} c={c} delay={i * 0.08} />
          ))}
        </div>
        <div className="mt-6 flex flex-wrap justify-center gap-6">
          {assistants.map((c, i) => (
            <CoachCard key={c.nom} c={c} delay={i * 0.08} />
          ))}
        </div>
      </section>

      {/* ---------- Accessible à tous (enchaîne sur "Venez les rencontrer") ---------- */}
      <section className="container-px mx-auto max-w-3xl pb-4 text-center">
        <Reveal>
          <span className="eyebrow justify-center">Accessible à tous</span>
          <h2 className="font-display mt-3 text-2xl font-extrabold uppercase text-ink sm:text-3xl">
            La boxe, ce n&apos;est pas (que) du combat
          </h2>
          <p className="mt-4 leading-relaxed text-smoke">
            C&apos;est un moyen de se dépenser, de prendre confiance en soi et
            d&apos;apprendre à se défendre, dans un cadre bienveillant et ouvert
            à tous les niveaux. Grâce à nos coachs qui vous accompagnent, chacun
            progresse à son rythme et évolue dans les meilleures conditions, du
            débutant au confirmé, enfant comme adulte.
          </p>
        </Reveal>
      </section>

      <CTABanner title="Venez les rencontrer" />
    </>
  );
}

// Carte d'un coach (hors Pascal) : largeur FIXE → toutes les photos identiques et
// plus petites que celle de Pascal. En colonne sur mobile, côte à côte dès sm.
function CoachCard({ c, delay }: { c: Coach; delay: number }) {
  return (
    <Reveal delay={delay} className="w-full sm:w-[14rem]">
      <div className="card-lift h-full overflow-hidden rounded-[1.75rem] border border-line bg-white">
        <div className="relative aspect-[4/5] overflow-hidden bg-ink">
          <Image
            src={c.photo}
            alt={`${c.nom}, ${c.role} du Punching Boxe`}
            fill
            sizes="(max-width: 640px) 100vw, 14rem"
            className={c.objectClass ?? "object-cover object-top"}
          />
        </div>
        <div className="p-5">
          <span className="rounded-full bg-orange px-3 py-1 text-[0.65rem] font-bold uppercase tracking-wide text-white">
            {c.badge}
          </span>
          <h3 className="font-display mt-3 break-words text-lg font-extrabold uppercase text-ink">
            {c.nom}
          </h3>
          <p className="mt-1 text-sm font-semibold text-orange">{c.role}</p>
          <p className="mt-2 text-sm leading-relaxed text-smoke">{c.phrase}</p>
        </div>
      </div>
    </Reveal>
  );
}
