import { CLUB, SALLES, SITE_URL } from "@/lib/constants";

/** Schema.org SportsClub — JSON-LD pour le référencement local. */
export function OrganizationSchema() {
  const data = {
    "@context": "https://schema.org",
    "@type": "SportsClub",
    name: CLUB.nom,
    alternateName: CLUB.sigle,
    description:
      "Club de Boxe Française (Savate) et Savate Fitness à Nogent-sur-Marne et Le Perreux-sur-Marne.",
    sport: ["Savate", "Boxe Française", "Fitness"],
    url: SITE_URL,
    logo: `${SITE_URL}/logo/logo.png`,
    image: `${SITE_URL}/images/IMG_0558.jpg`,
    telephone: CLUB.telephone,
    email: CLUB.email,
    foundingDate: String(CLUB.creeEn),
    address: {
      "@type": "PostalAddress",
      streetAddress: "19 bis rue Paul Bert",
      addressLocality: "Nogent-sur-Marne",
      postalCode: "94130",
      addressCountry: "FR",
    },
    areaServed: ["Nogent-sur-Marne", "Le Perreux-sur-Marne", "Val-de-Marne"],
    location: SALLES.map((s) => ({
      "@type": "Place",
      name: s.nom,
      address: `${s.adresse}, ${s.ville}`,
    })),
    openingHours: [
      "Mo 19:00-20:30",
      "Tu 18:00-21:00",
      "We 17:00-21:00",
      "Th 18:00-21:00",
      "Fr 19:00-21:00",
    ],
  };

  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: JSON.stringify(data) }}
    />
  );
}
