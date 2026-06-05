import type { ReactNode } from "react";
import { Reveal } from "@/components/ui/Reveal";

// Hero standard des pages intérieures — espacement harmonisé sur tout le site.
// pt-20/sm:pt-24 = la valeur la plus serrée qui dégage la navbar fixe (64/80px).
export function PageHero({
  eyebrow,
  title,
  intro,
}: {
  eyebrow: string;
  title: ReactNode;
  intro?: ReactNode;
}) {
  return (
    <section className="relative overflow-hidden border-b border-line bg-paper-2 pt-20 sm:pt-24">
      <div
        className="pointer-events-none absolute -left-32 top-0 h-96 w-96 opacity-20"
        style={{
          background:
            "radial-gradient(circle, var(--color-orange), transparent 65%)",
        }}
      />
      <div className="container-px relative mx-auto max-w-7xl pb-10 sm:pb-12">
        <Reveal>
          <span className="eyebrow">{eyebrow}</span>
          <h1 className="font-display mt-3 max-w-4xl break-words text-4xl font-black uppercase leading-[0.95] text-ink sm:text-6xl lg:text-[5rem]">
            {title}
          </h1>
          {intro && (
            <p className="mt-4 max-w-2xl text-base leading-relaxed text-smoke sm:text-lg">
              {intro}
            </p>
          )}
        </Reveal>
      </div>
    </section>
  );
}
