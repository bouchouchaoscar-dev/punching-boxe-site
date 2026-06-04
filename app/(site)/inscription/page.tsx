import type { Metadata } from "next";
import { PageHero } from "@/components/sections/PageHero";
import { DocumentsSection } from "@/components/inscription/DocumentsSection";
import { InscriptionForm } from "@/components/inscription/InscriptionForm";
import { Reveal } from "@/components/ui/Reveal";

export const metadata: Metadata = {
  title: "Inscription en ligne — Saison 2026-2027",
  description:
    "Inscrivez-vous en ligne au Punching Boxe de Nogent-Le Perreux : calcul automatique du tarif, dépôt des documents et paiement sécurisé (carte 1x à 4x ou espèces).",
};

export default function InscriptionPage() {
  return (
    <>
      <PageHero
        eyebrow="Inscription · Saison 2026-2027"
        title={<>Rejoignez le club</>}
        intro="Téléchargez vos documents, remplissez le formulaire, déposez vos pièces et réglez en ligne ou en espèces. Tout se fait en quelques minutes."
      />

      <DocumentsSection />

      <section className="border-t border-line bg-paper-2 py-14 sm:py-20">
        <div className="container-px mx-auto max-w-3xl">
          <Reveal>
            <span className="eyebrow">Formulaire</span>
            <h2 className="font-display mt-4 text-3xl font-extrabold uppercase text-ink sm:text-4xl">
              Inscription en ligne
            </h2>
            <p className="mt-3 text-smoke">
              Le tarif se calcule automatiquement selon votre profil.
            </p>
          </Reveal>

          <div className="mt-8">
            <InscriptionForm />
          </div>
        </div>
      </section>
    </>
  );
}
