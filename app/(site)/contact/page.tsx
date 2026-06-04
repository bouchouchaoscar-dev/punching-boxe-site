import type { Metadata } from "next";
import { PageHero } from "@/components/sections/PageHero";
import { Reveal } from "@/components/ui/Reveal";
import { ContactForm } from "@/components/contact/ContactForm";
import { Button } from "@/components/ui/Button";
import { CLUB, SALLES } from "@/lib/constants";

export const metadata: Metadata = {
  title: "Contact — Réservez votre séance d'essai gratuite",
  description:
    "Contactez le Punching Boxe de Nogent-Le Perreux. Téléphone 06 10 81 49 98, email contact@punching-boxe.com. Séance d'essai gratuite, gants prêtés sur place.",
};

export default function ContactPage() {
  return (
    <>
      <PageHero
        eyebrow="Contact"
        title={<>Poussez la porte</>}
        intro="Une question, une envie d'essayer ? Écrivez-nous ou appelez directement. La première séance est gratuite, on vous prête les gants."
      />

      <section className="container-px mx-auto max-w-7xl pt-12 pb-16 sm:pt-16 sm:pb-24">
        <div className="grid gap-12 lg:grid-cols-[1.1fr_0.9fr] lg:gap-16">
          <Reveal>
            <ContactForm />
          </Reveal>

          <Reveal delay={0.1}>
            <div className="space-y-4">
              <InfoCard
                title="Téléphone"
                value={CLUB.telephone}
                href={`tel:${CLUB.telephoneHref}`}
              />
              <InfoCard
                title="Email"
                value={CLUB.email}
                href={`mailto:${CLUB.email}`}
              />
              <InfoCard title="Adresse principale" value={CLUB.adresse} />
            </div>

            <div className="mt-6 overflow-hidden rounded-[1.5rem] border border-[#E5E5E5] bg-white p-8 text-ink shadow-[0_18px_45px_-28px_rgba(0,0,0,0.25)]">
              <span className="rounded-full bg-orange px-3 py-1 text-xs font-bold uppercase tracking-wide text-white">
                Gratuit
              </span>
              <h3 className="font-display mt-4 text-2xl font-extrabold uppercase text-[#111111]">
                Séance d&apos;essai
              </h3>
              <p className="mt-2 text-sm leading-relaxed text-[#555555]">
                Venez tester un cours sans engagement. Tenue de sport requise,
                gants prêtés sur place. Choisissez le créneau qui vous arrange et
                présentez-vous au professeur.
              </p>
              <div className="mt-5 flex flex-col gap-3 sm:flex-row">
                <Button href="/inscription" size="md">
                  S&apos;inscrire en ligne
                </Button>
                <Button href="/infos" variant="outline" size="md">
                  Voir les horaires
                </Button>
              </div>
            </div>

            <p className="mt-6 text-sm font-semibold uppercase tracking-wide text-smoke">
              Nos salles
            </p>
            <ul className="mt-3 space-y-2 text-sm text-smoke">
              {SALLES.map((s) => (
                <li key={s.nom}>
                  <span className="font-semibold text-ink">{s.nom}</span> —{" "}
                  {s.adresse}, {s.ville}
                </li>
              ))}
            </ul>
          </Reveal>
        </div>
      </section>
    </>
  );
}

function InfoCard({
  title,
  value,
  href,
}: {
  title: string;
  value: string;
  href?: string;
}) {
  const inner = (
    <div className="flex items-center justify-between rounded-2xl border border-line bg-white p-5 transition-colors hover:border-orange">
      <div>
        <p className="text-xs font-bold uppercase tracking-wide text-smoke">
          {title}
        </p>
        <p className="mt-1 font-display text-xl font-extrabold text-ink">
          {value}
        </p>
      </div>
      {href && (
        <span className="flex h-9 w-9 items-center justify-center rounded-full bg-orange/10 text-orange">
          →
        </span>
      )}
    </div>
  );
  return href ? <a href={href}>{inner}</a> : inner;
}
