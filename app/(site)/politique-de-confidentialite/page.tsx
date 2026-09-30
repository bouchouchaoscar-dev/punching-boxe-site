import type { Metadata } from "next";
import { LegalLayout, LegalSection } from "@/components/legal/LegalLayout";
import { CLUB } from "@/lib/constants";

export const metadata: Metadata = {
  title: "Politique de confidentialité",
  description:
    "Politique de confidentialité du Punching Boxe de Nogent-Le Perreux : données collectées, finalité, conservation et droits des adhérents (RGPD).",
};

export default function ConfidentialitePage() {
  return (
    <LegalLayout title="Politique de confidentialité">
      <LegalSection title="Responsable du traitement">
        <p>
          {CLUB.directeur}, pour l&apos;association Punching Boxe de
          Nogent-Le Perreux.
        </p>
      </LegalSection>

      <LegalSection title="Données collectées">
        <p>
          Dans le cadre des inscriptions, nous collectons : nom, prénom, date de
          naissance, email, téléphone, adresse, ainsi que les documents
          téléversés (fiche d&apos;inscription, certificat médical, règlement
          signé au format PDF et photo d&apos;identité).
        </p>
      </LegalSection>

      <LegalSection title="Finalité">
        <p>
          Ces données sont utilisées exclusivement pour la gestion des adhésions
          et le suivi administratif du club.
        </p>
      </LegalSection>

      <LegalSection title="Base légale">
        <p>
          Le traitement repose sur l&apos;exécution du contrat d&apos;adhésion.
        </p>
      </LegalSection>

      <LegalSection title="Durée de conservation">
        <p>
          Les données sont conservées pendant la durée de l&apos;adhésion,
          puis archivées pendant 2 ans.
        </p>
      </LegalSection>

      <LegalSection title="Présence aux cours et séances d'essai">
        <p>
          Lorsqu&apos;un adhérent pointe sa présence à un cours (scan d&apos;un QR
          code affiché dans les salles), le club enregistre sa présence à la
          séance concernée. Les personnes qui viennent en séance d&apos;essai
          laissent leur prénom, nom, date de naissance et une adresse email.
        </p>
        <p>
          Finalité : organisation des cours et suivi des inscriptions. Les
          coordonnées d&apos;une séance d&apos;essai servent à envoyer au maximum
          deux emails d&apos;invitation à s&apos;inscrire ; ces envois cessent
          immédiatement en cas d&apos;inscription ou de désinscription.
        </p>
        <p>
          Conservation : les présences et les coordonnées des séances d&apos;essai
          non converties sont conservées pendant la saison en cours et la saison
          suivante, puis supprimées automatiquement. Vous pouvez à tout moment
          vous opposer à ces traitements ou demander la suppression de vos
          données en nous contactant.
        </p>
      </LegalSection>

      <LegalSection title="Hébergement des données">
        <p>
          Les données sont hébergées par Supabase, sur des serveurs situés dans
          l&apos;Union européenne (EU).
        </p>
      </LegalSection>

      <LegalSection title="Vos droits">
        <p>
          Conformément au RGPD, vous disposez d&apos;un droit d&apos;accès, de
          rectification, de suppression et de portabilité de vos données. Pour
          exercer ces droits, écrivez à{" "}
          <a
            href={`mailto:${CLUB.email}`}
            className="font-semibold text-orange hover:underline"
          >
            {CLUB.email}
          </a>
          .
        </p>
      </LegalSection>

      <LegalSection title="Transmission à des tiers">
        <p>Aucune donnée n&apos;est transmise à des tiers.</p>
      </LegalSection>

      <LegalSection title="Cookies">
        <p>
          Le site n&apos;utilise aucun cookie publicitaire, uniquement des
          cookies techniques nécessaires à son bon fonctionnement.
        </p>
      </LegalSection>
    </LegalLayout>
  );
}
