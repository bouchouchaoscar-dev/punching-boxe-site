import { Reveal } from "@/components/ui/Reveal";

export function DocumentsSection() {
  return (
    <section className="container-px mx-auto max-w-7xl pt-12 pb-16">
      <Reveal>
        <span className="eyebrow">Vos documents</span>
        <h2 className="font-display mt-3 text-3xl font-extrabold uppercase text-ink sm:text-4xl">
          Vos documents, en ligne
        </h2>
        <p className="mt-3 max-w-2xl text-smoke">
          Votre <strong>fiche d&apos;inscription est générée automatiquement</strong>{" "}
          à partir de vos informations : vous la vérifiez et la signez en ligne,
          tout comme le règlement intérieur. Rien à télécharger ni imprimer.
          Prévoyez seulement une <strong>photo d&apos;identité</strong> (JPG) et un{" "}
          <strong>certificat médical</strong>, le seul document à faire établir
          par votre médecin : anticipez-le.
        </p>
      </Reveal>

      <div className="mt-10 grid gap-5 lg:grid-cols-2">
        {/* Certificat médical : seul document tiers → mis en avant */}
        <Reveal>
          <div className="flex h-full flex-col rounded-[1.5rem] border-2 border-orange/30 bg-orange-50 p-6">
            <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-orange/15 text-orange">
              <svg viewBox="0 0 24 24" className="h-6 w-6" fill="none">
                <path d="M7 3h7l5 5v13H7a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2z" stroke="currentColor" strokeWidth="1.6" />
                <path d="M14 3v5h5M12 11v6M9 14h6" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
              </svg>
            </div>
            <h3 className="font-display mt-5 text-xl font-extrabold uppercase text-ink">
              Certificat médical
            </h3>
            <p className="mt-2 flex-1 text-sm leading-relaxed text-smoke">
              Le seul document à faire établir par un tiers. Téléchargez le modèle
              ci-dessous et remettez-le à votre médecin, puis déposez le certificat
              pendant l&apos;inscription ou plus tard depuis votre espace.{" "}
              <strong>Non bloquant</strong> pour vous inscrire et payer, mais
              obligatoire à fournir dans les meilleurs délais.
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

        {/* Fiche + règlement : signés en ligne, rien à télécharger */}
        <Reveal delay={0.08}>
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
              Pré-remplis avec vos informations : à l&apos;étape « Documents », vous
              ouvrez chaque document, le <strong>vérifiez</strong>, puis le{" "}
              <strong>signez en ligne</strong> (au doigt ou à la souris). Aucune
              impression. Vous pouvez consulter le règlement dès maintenant.
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
      </div>

      {/* Encart parents : process d'inscription d'un enfant mineur */}
      <Reveal delay={0.12}>
        <div className="mt-6 rounded-[1.5rem] border border-line bg-paper-2 p-6">
          <h3 className="font-display text-lg font-extrabold uppercase text-ink">
            Vous inscrivez votre enfant&nbsp;?
          </h3>
          <p className="mt-2 max-w-3xl text-sm leading-relaxed text-smoke">
            Créez d&apos;abord <strong>votre espace adhérent en votre nom</strong>{" "}
            (le parent), puis ouvrez depuis cet espace un{" "}
            <strong>dossier au nom de votre enfant</strong>. Vous signez en ligne
            une <strong>autorisation parentale</strong> ; la fiche
            d&apos;inscription et le règlement intérieur sont générés et signés
            automatiquement. Le <strong>certificat médical</strong> est à
            télécharger, faire signer par votre médecin, puis à déposer (non
            bloquant pour valider l&apos;inscription). Un même espace permet
            d&apos;inscrire plusieurs enfants.
          </p>
        </div>
      </Reveal>
    </section>
  );
}
