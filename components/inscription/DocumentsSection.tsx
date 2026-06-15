import { Reveal } from "@/components/ui/Reveal";

export function DocumentsSection() {
  return (
    <section className="container-px mx-auto max-w-7xl pt-12 pb-16">
      <Reveal>
        <span className="eyebrow">Vos documents</span>
        <h2 className="font-display mt-3 text-3xl font-extrabold uppercase text-ink sm:text-4xl">
          Tout se remplit et se signe en ligne
        </h2>
        <p className="mt-3 max-w-2xl text-smoke">
          Plus rien à télécharger ni imprimer pour la fiche d&apos;inscription et
          le règlement intérieur : ils sont <strong>remplis et signés
          directement en ligne</strong> pendant votre inscription. Seul le
          certificat médical est à faire établir par votre médecin. Prévoyez aussi
          une photo d&apos;identité (JPG/PNG).
        </p>
      </Reveal>

      <div className="mt-10 grid gap-5 lg:grid-cols-2">
        {/* Fiche + règlement : remplis et signés en ligne */}
        <Reveal>
          <div className="flex h-full flex-col rounded-[1.5rem] border border-line bg-white p-6">
            <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-orange/10 text-orange">
              <svg viewBox="0 0 24 24" className="h-6 w-6" fill="none">
                <path d="M12 20h9" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
                <path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4 12.5-12.5z" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" />
              </svg>
            </div>
            <h3 className="font-display mt-5 text-xl font-extrabold uppercase text-ink">
              Fiche d&apos;inscription &amp; règlement
            </h3>
            <p className="mt-2 flex-1 text-sm leading-relaxed text-smoke">
              Pré-remplis avec vos informations, puis <strong>signés en ligne</strong>{" "}
              (au doigt ou à la souris) à l&apos;étape « Documents » du formulaire.
              Rien à imprimer.
            </p>
            <a
              href="/api/documents/reglement-interieur"
              target="_blank"
              rel="noopener noreferrer"
              className="mt-5 inline-flex items-center gap-1.5 text-sm font-bold text-orange hover:underline"
            >
              Consulter le règlement intérieur →
            </a>
          </div>
        </Reveal>

        {/* Certificat médical : tiers (médecin) + dépôt */}
        <Reveal delay={0.08}>
          <div className="flex h-full flex-col rounded-[1.5rem] border border-line bg-white p-6">
            <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-orange/10 text-orange">
              <svg viewBox="0 0 24 24" className="h-6 w-6" fill="none">
                <path d="M7 3h7l5 5v13H7a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2z" stroke="currentColor" strokeWidth="1.6" />
                <path d="M14 3v5h5M12 11v6M9 14h6" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
              </svg>
            </div>
            <h3 className="font-display mt-5 text-xl font-extrabold uppercase text-ink">
              Certificat médical
            </h3>
            <p className="mt-2 flex-1 text-sm leading-relaxed text-smoke">
              À faire établir par votre médecin (remettez-lui le modèle ci-dessous),
              puis à déposer pendant l&apos;inscription ou plus tard depuis votre
              espace. <strong>Non bloquant</strong> pour finaliser et payer, mais
              obligatoire dans les meilleurs délais.
            </p>
            <a
              href="/api/documents/certificat-medical"
              target="_blank"
              rel="noopener noreferrer"
              className="mt-5 inline-flex items-center gap-1.5 text-sm font-bold text-orange hover:underline"
            >
              Télécharger le modèle pour le médecin →
            </a>
          </div>
        </Reveal>
      </div>
    </section>
  );
}
