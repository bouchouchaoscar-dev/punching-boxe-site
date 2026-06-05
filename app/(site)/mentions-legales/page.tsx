import type { Metadata } from "next";
import { LegalLayout, LegalSection } from "@/components/legal/LegalLayout";
import { CLUB } from "@/lib/constants";

export const metadata: Metadata = {
  title: "Mentions légales",
  description:
    "Mentions légales du site du Punching Boxe de Nogent-Le Perreux : éditeur, directeur de publication, hébergeur et contact.",
};

export default function MentionsLegalesPage() {
  return (
    <LegalLayout title="Mentions légales">
      <LegalSection title="Éditeur du site">
        <p>
          Association <strong>Punching Boxe de Nogent-Le Perreux</strong>,
          association loi 1901.
        </p>
        <p>19 bis rue Paul Bert, 94130 Nogent-sur-Marne</p>
      </LegalSection>

      <LegalSection title="Directeur de la publication">
        <p>{CLUB.directeur}</p>
      </LegalSection>

      <LegalSection title="Hébergeur">
        <p>
          Vercel Inc.
          <br />
          340 Pine Street, Suite 801
          <br />
          San Francisco, CA 94104, États-Unis
        </p>
      </LegalSection>

      <LegalSection title="Contact">
        <p>
          Email :{" "}
          <a
            href={`mailto:${CLUB.email}`}
            className="font-semibold text-orange hover:underline"
          >
            {CLUB.email}
          </a>
        </p>
        <p>
          Téléphone :{" "}
          <a
            href={`tel:${CLUB.telephoneHref}`}
            className="font-semibold text-orange hover:underline"
          >
            {CLUB.telephone}
          </a>
        </p>
      </LegalSection>

      <LegalSection title="Propriété intellectuelle">
        <p>
          L&apos;ensemble des contenus présents sur ce site (textes, images,
          logo) est la propriété de l&apos;association, sauf mention contraire.
          Toute reproduction sans autorisation est interdite.
        </p>
      </LegalSection>
    </LegalLayout>
  );
}
