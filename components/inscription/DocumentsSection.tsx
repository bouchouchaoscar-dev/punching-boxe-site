import { Reveal } from "@/components/ui/Reveal";

const DOCS = [
  {
    titre: "Fiche d'inscription",
    desc: "Vos informations personnelles et le détail de la cotisation.",
    href: "/api/documents/fiche-inscription",
  },
  {
    titre: "Certificat médical",
    desc: "À faire compléter et signer par votre médecin.",
    href: "/api/documents/certificat-medical",
  },
  {
    titre: "Règlement intérieur",
    desc: "À lire, approuver et signer avant l'inscription.",
    href: "/api/documents/reglement-interieur",
  },
];

export function DocumentsSection() {
  return (
    <section className="container-px mx-auto max-w-7xl py-14 sm:py-20">
      <Reveal>
        <span className="eyebrow">Étape préalable</span>
        <h2 className="font-display mt-4 text-3xl font-extrabold uppercase text-ink sm:text-4xl">
          Téléchargez vos documents
        </h2>
        <p className="mt-3 max-w-2xl text-smoke">
          Téléchargez, remplissez et signez ces trois documents avant de vous
          inscrire. Vous les déposerez dans le formulaire ci-dessous une fois
          complétés. Prévoyez également une photo d&apos;identité (JPG/PNG) à
          uploader lors de l&apos;inscription.
        </p>
      </Reveal>

      <div className="mt-10 grid gap-5 lg:grid-cols-3">
        {DOCS.map((d, i) => (
          <Reveal key={d.titre} delay={i * 0.08}>
            <a
              href={d.href}
              target="_blank"
              rel="noopener noreferrer"
              className="card-lift group flex h-full flex-col rounded-[1.5rem] border border-line bg-white p-6"
            >
              <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-orange/10 text-orange">
                <svg viewBox="0 0 24 24" className="h-6 w-6" fill="none">
                  <path
                    d="M7 3h7l5 5v13a0 0 0 0 1 0 0H7a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2z"
                    stroke="currentColor"
                    strokeWidth="1.6"
                  />
                  <path d="M14 3v5h5" stroke="currentColor" strokeWidth="1.6" />
                </svg>
              </div>
              <h3 className="font-display mt-5 text-xl font-extrabold uppercase text-ink">
                {d.titre}
              </h3>
              <p className="mt-2 flex-1 text-sm leading-relaxed text-smoke">
                {d.desc}
              </p>
              <span className="mt-5 inline-flex items-center gap-1.5 text-sm font-bold text-orange">
                Télécharger le PDF
                <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none">
                  <path
                    d="M12 4v12m0 0l-4-4m4 4l4-4M5 20h14"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
              </span>
            </a>
          </Reveal>
        ))}
      </div>
    </section>
  );
}
