import { CLUB, SALLES, SITE_URL } from "@/lib/constants";

/** Schema.org SportsClub — JSON-LD pour le référencement local. */
export function OrganizationSchema() {
  const data = {
    "@context": "https://schema.org",
    // Double type : club sportif + lieu d'activité (meilleur signal local / Maps).
    "@type": ["SportsClub", "SportsActivityLocation"],
    "@id": `${SITE_URL}/#club`,
    name: CLUB.nom,
    alternateName: CLUB.sigle,
    description:
      "Club de boxe française (savate), savate fitness et préparation physique à Nogent-sur-Marne et Le Perreux-sur-Marne (94). Cours de boxe, savate, fitness et remise en forme pour enfants et adultes. Inscription 100% en ligne.",
    slogan: "Savate · Boxe Française · Inscription 100% en ligne",
    url: SITE_URL,
    logo: `${SITE_URL}/logo/logo.png`,
    image: [
      `${SITE_URL}/images/IMG_0558.jpg`,
      `${SITE_URL}/images/IMG_0574.jpg`,
    ],
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
    geo: {
      "@type": "GeoCoordinates",
      latitude: 48.8354,
      longitude: 2.4833,
    },
    hasMap: "https://www.google.com/maps?q=48.8354,2.4833",
    areaServed: [
      "Nogent-sur-Marne (94130)",
      "Le Perreux-sur-Marne (94170)",
      "Vincennes",
      "Joinville-le-Pont",
      "Champigny-sur-Marne",
      "Bry-sur-Marne",
      "Fontenay-sous-Bois",
      "Saint-Mandé",
      "Val-de-Marne (94)",
      "Est parisien",
    ],
    location: SALLES.map((s) => ({
      "@type": "Place",
      name: s.nom,
      address: `${s.adresse}, ${s.ville}`,
    })),
    sport: ["Boxe Française", "Savate", "Préparation physique", "Fitness"],
    keywords:
      "club de boxe, cours de boxe, boxe française, savate, cours de fitness, remise en forme, préparation physique, Nogent-sur-Marne, Le Perreux-sur-Marne, Val-de-Marne, inscription en ligne",
    priceRange: "330€-530€/an",
    numberOfEmployees: 5,
    openingHours: [
      "Mo 19:00-21:00",
      "Tu 18:00-21:00",
      "We 17:00-21:00",
      "Th 18:00-21:00",
      "Fr 17:30-20:30",
    ],
    // Catalogue d'offres (formules) — renforce les requêtes fitness/prépa.
    makesOffer: [
      {
        "@type": "Offer",
        name: "Formule Boxe Française",
        category: "Cours de boxe française",
        description:
          "5 cours adultes / 4 cours enfants par semaine. Boxe loisir et compétition, accessible à tous les niveaux.",
      },
      {
        "@type": "Offer",
        name: "Formule Savate & Prépa",
        category: "Savate, fitness et préparation physique",
        description:
          "3 cours par semaine : un cours de savate + deux cours de préparation physique. Remise en forme et cardio.",
      },
    ],
  };

  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: JSON.stringify(data) }}
    />
  );
}
