import { PageHero } from "@/components/sections/PageHero";
import { DocumentsSection } from "@/components/inscription/DocumentsSection";
import { InscriptionGate } from "@/components/inscription/InscriptionGate";
import { Reveal } from "@/components/ui/Reveal";
import { pageMeta } from "@/lib/seo";

export const metadata = pageMeta({
  title:
    "Inscription en ligne | Punching Boxe Nogent-Le Perreux - Saison 2026-2027",
  description:
    "Inscrivez-vous en ligne au Punching Boxe de Nogent-Le Perreux. Paiement sécurisé en 1 à 4 fois. Espace adhérent personnel.",
  path: "/inscription",
  image: "/images/IMG_0521.jpg",
});

export default function InscriptionPage() {
  return (
    <>
      <PageHero
        eyebrow="Inscription · Saison 2026-2027"
        title={<>Rejoignez le club</>}
        intro="Inscription 100% en ligne depuis votre espace adhérent personnel. Téléchargez vos documents, remplissez le formulaire, déposez vos pièces et réglez en ligne ou en espèces. Tout se fait en quelques minutes."
      />

      <DocumentsSection />

      <section className="border-t border-line bg-paper-2 py-16">
        <div className="container-px mx-auto max-w-3xl">
          <Reveal>
            <span className="eyebrow">Formulaire</span>
            <h2 className="font-display mt-3 text-3xl font-extrabold uppercase text-ink sm:text-4xl">
              Inscription en ligne
            </h2>
            <p className="mt-3 text-smoke">
              Le tarif se calcule automatiquement selon votre profil.
            </p>
            <div className="mt-5 rounded-xl border border-orange/30 bg-orange-50 p-4 text-sm leading-relaxed text-ink">
              <span className="font-semibold">👪 Plusieurs membres de votre famille ?</span>{" "}
              Créez un seul compte, puis ajoutez chaque dossier depuis votre
              espace adhérent, la réduction famille est appliquée automatiquement
              (−10 % dès le 3e membre, −15 % au 4e, −20 % au 5e, sur la
              cotisation).
            </div>
          </Reveal>

          <div className="mt-8">
            <InscriptionGate />
          </div>
        </div>
      </section>
    </>
  );
}
