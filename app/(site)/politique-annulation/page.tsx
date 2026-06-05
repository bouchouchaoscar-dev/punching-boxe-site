import type { Metadata } from "next";
import { LegalLayout, LegalSection } from "@/components/legal/LegalLayout";
import { CLUB } from "@/lib/constants";

export const metadata: Metadata = {
  title: "Politique d'annulation et de remboursement",
  description:
    "Politique d'annulation du Punching Boxe de Nogent-Le Perreux : adhésion ferme, cas de remboursement (raison médicale, déménagement) et modalités.",
};

export default function PolitiqueAnnulationPage() {
  return (
    <LegalLayout title="Politique d'annulation">
      <LegalSection title="Adhésion ferme et définitive">
        <p>
          L&apos;adhésion au {CLUB.nom} est ferme et définitive pour la saison en
          cours.
        </p>
      </LegalSection>

      <LegalSection title="Paiement fractionné">
        <p>
          En cas de paiement fractionné, toutes les échéances seront prélevées
          automatiquement conformément à l&apos;engagement signé.
          L&apos;adhérent ne peut pas les annuler unilatéralement.
        </p>
      </LegalSection>

      <LegalSection title="Cas de remboursement">
        <p>
          Un remboursement, au prorata des mois non consommés, n&apos;est possible
          que dans les deux cas suivants :
        </p>
        <p>
          <strong>1. Raison médicale</strong> — sur présentation d&apos;un
          certificat médical attestant l&apos;impossibilité définitive de
          pratiquer toute activité sportive.
        </p>
        <p>
          <strong>2. Déménagement</strong> — sur présentation d&apos;un
          justificatif de domicile (nouveau bail signé ou acte notarié) attestant
          un déménagement à plus de 50 km du club.
        </p>
      </LegalSection>

      <LegalSection title="Modalités de demande">
        <p>
          Toute demande doit être adressée par email à{" "}
          <a
            href={`mailto:${CLUB.email}`}
            className="font-semibold text-orange hover:underline"
          >
            {CLUB.email}
          </a>{" "}
          accompagnée des justificatifs nécessaires.
        </p>
        <p>Délai de traitement : 30 jours.</p>
      </LegalSection>

      <LegalSection title="Litiges">
        <p>
          En cas de litige, le tribunal compétent est celui de Créteil (94).
        </p>
      </LegalSection>
    </LegalLayout>
  );
}
