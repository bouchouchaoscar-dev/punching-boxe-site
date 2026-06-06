import { Reveal } from "@/components/ui/Reveal";

const FAQ_ITEMS: { q: string; a: string }[] = [
  {
    q: "Combien coûte une adhésion ?",
    a: "La cotisation annuelle est de 430 € pour la Formule Boxe Française (410 € pour les jeunes) et de 390 € pour la Formule Savate & Prépa (370 € jeunes), licence fédérale incluse. Ajoutez 30 € d'adhésion la première année. À partir de janvier, le tarif est calculé au prorata des mois restants de la saison.",
  },
  {
    q: "Y a-t-il des cours pour les enfants ?",
    a: "Oui. Des cours de Boxe Française sont proposés aux enfants dès 5 ans, encadrés par des moniteurs fédéraux, plusieurs fois par semaine.",
  },
  {
    q: "Peut-on payer en plusieurs fois ?",
    a: "Oui. Le paiement en ligne par carte bancaire est possible en 1, 2, 3 ou 4 fois selon la période de la saison, ou en espèces auprès du professeur lors de votre prochain cours.",
  },
  {
    q: "Où se trouvent les salles ?",
    a: "Le club s'entraîne sur 4 salles à Nogent-sur-Marne et Le Perreux-sur-Marne : le Gymnase du Port, le Gymnase des Ormes, le Gymnase du Centre et le Dojo David Douillet.",
  },
  {
    q: "Comment s'inscrire ?",
    a: "L'inscription se fait 100 % en ligne : créez votre espace adhérent en quelques secondes, téléchargez et déposez vos documents (fiche d'inscription, règlement signé, photo d'identité), puis réglez en ligne ou en espèces.",
  },
  {
    q: "Y a-t-il une séance d'essai gratuite ?",
    a: "Oui, une première séance est offerte. Venez simplement en tenue de sport : les gants sont prêtés sur place.",
  },
];

export function FAQ() {
  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: FAQ_ITEMS.map((item) => ({
      "@type": "Question",
      name: item.q,
      acceptedAnswer: { "@type": "Answer", text: item.a },
    })),
  };

  return (
    <section className="container-px mx-auto max-w-3xl pt-8 pb-16">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
      <Reveal>
        <span className="eyebrow">Questions fréquentes</span>
        <h2 className="font-display mt-3 break-words text-3xl font-extrabold uppercase text-ink sm:text-4xl">
          Tout ce qu&apos;il faut savoir
        </h2>
      </Reveal>

      <div className="mt-8 divide-y divide-line rounded-[1.5rem] border border-line bg-white">
        {FAQ_ITEMS.map((item, i) => (
          <Reveal key={item.q} delay={i * 0.04}>
            <details className="group p-5 sm:p-6">
              <summary className="flex cursor-pointer list-none items-center justify-between gap-4 font-display text-lg font-extrabold uppercase text-ink">
                {item.q}
                <span className="text-orange transition-transform group-open:rotate-45">
                  +
                </span>
              </summary>
              <p className="mt-3 text-sm leading-relaxed text-smoke">{item.a}</p>
            </details>
          </Reveal>
        ))}
      </div>
    </section>
  );
}
