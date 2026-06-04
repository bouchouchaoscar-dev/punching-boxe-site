import Image from "next/image";
import { Button, ArrowIcon } from "@/components/ui/Button";
import { Reveal } from "@/components/ui/Reveal";

export function CTABanner({
  title = "Essayez. C'est gratuit.",
  text = "Une première séance offerte, gants prêtés sur place. Venez en tenue de sport et poussez la porte du club.",
}: {
  title?: string;
  text?: string;
}) {
  return (
    <section className="container-px mx-auto max-w-7xl py-16 sm:py-24">
      <Reveal className="relative overflow-hidden rounded-[2rem] bg-ink px-6 py-16 sm:px-16 sm:py-24">
        <div className="grain absolute inset-0" />
        <Image
          src="/images/IMG_0574.jpg"
          alt=""
          fill
          sizes="100vw"
          className="object-cover opacity-25"
        />
        <div className="absolute inset-0 bg-gradient-to-r from-ink via-ink/80 to-ink/30" />
        <div
          className="absolute -right-10 top-0 h-full w-1/2 opacity-20"
          style={{
            background:
              "radial-gradient(circle at 70% 50%, var(--color-orange), transparent 60%)",
          }}
        />
        <div className="relative max-w-2xl">
          <span className="eyebrow text-orange">Séance d&apos;essai</span>
          <h2 className="font-display mt-5 text-4xl font-extrabold uppercase text-white sm:text-6xl">
            {title}
          </h2>
          <p className="mt-5 max-w-lg text-base leading-relaxed text-white/70 sm:text-lg">
            {text}
          </p>
          <div className="mt-8 flex flex-col gap-3 sm:flex-row">
            <Button href="/inscription" size="lg">
              S&apos;inscrire en ligne <ArrowIcon />
            </Button>
            <Button href="/contact" variant="ghost" size="lg">
              Réserver ma séance d&apos;essai
            </Button>
          </div>
        </div>
      </Reveal>
    </section>
  );
}
