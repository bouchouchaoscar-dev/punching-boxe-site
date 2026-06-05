import type { ReactNode } from "react";

/** Mise en page sobre commune aux pages légales (navbar/footer via le layout site). */
export function LegalLayout({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}) {
  return (
    <section className="container-px mx-auto max-w-3xl pt-28 pb-20">
      <span className="eyebrow">Informations légales</span>
      <h1 className="font-display mt-3 text-4xl font-black uppercase text-orange sm:text-5xl">
        {title}
      </h1>
      <p className="mt-3 text-sm text-smoke">Dernière mise à jour : juin 2026</p>
      <div className="mt-10 space-y-8">{children}</div>
    </section>
  );
}

/** Bloc de section : H2 noir + contenu. */
export function LegalSection({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}) {
  return (
    <div>
      <h2 className="font-display text-xl font-extrabold uppercase text-ink">
        {title}
      </h2>
      <div className="mt-3 space-y-2 text-sm leading-relaxed text-[#333333]">
        {children}
      </div>
    </div>
  );
}
