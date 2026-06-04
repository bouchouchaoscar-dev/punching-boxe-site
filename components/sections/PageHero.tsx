import type { ReactNode } from "react";
import { Reveal } from "@/components/ui/Reveal";

export function PageHero({
  eyebrow,
  title,
  intro,
  compact = false,
}: {
  eyebrow: string;
  title: ReactNode;
  intro?: ReactNode;
  compact?: boolean;
}) {
  const padTop = compact ? "pt-20 sm:pt-24" : "pt-28 sm:pt-36";
  const padBottom = compact ? "pb-8 sm:pb-10" : "pb-14 sm:pb-20";
  return (
    <section
      className={`relative overflow-hidden border-b border-line bg-paper-2 ${padTop}`}
    >
      <div
        className="pointer-events-none absolute -left-32 top-0 h-96 w-96 opacity-20"
        style={{
          background:
            "radial-gradient(circle, var(--color-orange), transparent 65%)",
        }}
      />
      <div className={`container-px relative mx-auto max-w-7xl ${padBottom}`}>
        <Reveal>
          <span className="eyebrow">{eyebrow}</span>
          <h1 className="font-display mt-5 max-w-4xl text-5xl font-black uppercase leading-[0.92] text-ink sm:text-7xl lg:text-[5rem]">
            {title}
          </h1>
          {intro && (
            <p className="mt-6 max-w-2xl text-base leading-relaxed text-smoke sm:text-lg">
              {intro}
            </p>
          )}
        </Reveal>
      </div>
    </section>
  );
}
