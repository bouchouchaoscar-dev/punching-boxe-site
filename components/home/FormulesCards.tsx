import Link from "next/link";
import { Reveal } from "@/components/ui/Reveal";
import { ArrowIcon } from "@/components/ui/Button";

const FORMULES = [
  {
    titre: "Formule Boxe",
    desc: "Boxe Française enfants & adultes, sur 4 salles. Adultes 5 cours/sem, enfants 4 cours/sem. Option Prépa Physique +100€/an.",
    icon: "gloves" as const,
  },
  {
    titre: "Formule Savate & Forme",
    desc: "Savate Fitness + Préparation Physique. Idéal remise en forme, sans esprit de compétition.",
    icon: "flame" as const,
  },
];

export function FormulesCards() {
  return (
    <div className="grid gap-6 sm:grid-cols-2">
      {FORMULES.map((f, i) => (
        <Reveal key={f.titre} delay={i * 0.1}>
          <Link
            href="/inscription"
            className="card-lift group flex h-full flex-col rounded-[1.75rem] border border-line bg-white p-7 transition-colors hover:border-orange sm:p-8"
          >
            <span className="flex h-14 w-14 items-center justify-center rounded-2xl bg-orange/10 text-orange transition-colors group-hover:bg-orange group-hover:text-white">
              <Icon name={f.icon} />
            </span>
            <h3 className="font-display mt-5 text-2xl font-extrabold uppercase text-ink sm:text-3xl">
              {f.titre}
            </h3>
            <p className="mt-3 flex-1 leading-relaxed text-smoke">{f.desc}</p>
            <span className="mt-6 inline-flex items-center gap-1.5 text-sm font-bold text-ink">
              S&apos;inscrire avec cette formule <ArrowIcon />
            </span>
          </Link>
        </Reveal>
      ))}
    </div>
  );
}

function Icon({ name }: { name: "gloves" | "flame" }) {
  if (name === "flame") {
    return (
      <svg viewBox="0 0 24 24" className="h-7 w-7" fill="none" aria-hidden>
        <path
          d="M12 2c1.5 3 4.5 4.5 4.5 8.5A4.5 4.5 0 0 1 12 15a4.5 4.5 0 0 1-4.5-4.5C7.5 8.5 9 7 9.5 5.5 10.8 6.5 11 8 11 8c.8-1.5 1-4 1-6z"
          stroke="currentColor"
          strokeWidth="1.6"
          strokeLinejoin="round"
        />
        <path
          d="M8.5 13.5C8 14.3 7.5 15.3 7.5 16.5A4.5 4.5 0 0 0 12 21a4.5 4.5 0 0 0 4.5-4.5c0-1-.3-1.8-.7-2.6"
          stroke="currentColor"
          strokeWidth="1.6"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    );
  }
  // Gant de boxe
  return (
    <svg viewBox="0 0 24 24" className="h-7 w-7" fill="none" aria-hidden>
      <path
        d="M7 9a4 4 0 0 1 4-4h3a5 5 0 0 1 5 5v2a4 4 0 0 1-4 4H9a3 3 0 0 1-3-3V9z"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinejoin="round"
      />
      <path
        d="M7 11H5.5A1.5 1.5 0 0 0 4 12.5v0A1.5 1.5 0 0 0 5.5 14H7"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path d="M9 16v2a2 2 0 0 0 2 2h4a2 2 0 0 0 2-2v-2" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" />
    </svg>
  );
}
