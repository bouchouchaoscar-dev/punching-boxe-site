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
      <Reveal className="rounded-[2rem] border border-[#E5E5E5] bg-white px-6 py-16 shadow-[0_24px_60px_-32px_rgba(0,0,0,0.25)] sm:px-16 sm:py-24">
        <div className="max-w-2xl">
          <span className="eyebrow text-orange">Séance d&apos;essai</span>
          <h2 className="font-display mt-5 text-4xl font-extrabold uppercase text-[#111111] sm:text-6xl">
            {title}
          </h2>
          <p className="mt-5 max-w-lg text-base leading-relaxed text-[#555555] sm:text-lg">
            {text}
          </p>
          <div className="mt-8 flex flex-col gap-3 sm:flex-row">
            <Button href="/inscription" size="lg">
              S&apos;inscrire en ligne <ArrowIcon />
            </Button>
            <Button href="/contact" variant="outline" size="lg">
              Réserver ma séance d&apos;essai
            </Button>
          </div>
        </div>
      </Reveal>
    </section>
  );
}
