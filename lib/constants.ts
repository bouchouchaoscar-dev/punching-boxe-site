// ============================================================
// Données du club — source unique de vérité.
// ============================================================

export const SITE_URL =
  process.env.NEXT_PUBLIC_SITE_URL || "https://punching-boxe.com";

export const CLUB = {
  nom: "Punching Boxe de Nogent-Le Perreux",
  nomCourt: "Punching Boxe",
  sigle: "PBNP",
  baseline: "Savate · Boxe Française",
  creeEn: 2000,
  telephone: "06 10 81 49 98",
  telephoneHref: "+33610814998",
  email: "contact@punching-boxe.com",
  adresse: "19 bis rue Paul Bert, 94130 Nogent-sur-Marne",
  directeur: "Pascal BOUCHOUCHA",
  directeurTitre: "Professeur fédéral · B.E.E.S 1er degré",
  saison: "2026-2027",
  facebook: "https://www.facebook.com/",
  instagram: "https://www.instagram.com/",
} as const;

export const STATS = [
  { value: 300, suffix: "+", label: "Adhérents par saison" },
  { value: 4, suffix: "", label: "Salles d'entraînement" },
  { value: 25, suffix: "+", label: "Ans d'existence" },
  { value: 5, suffix: "", label: "Cours par semaine" },
] as const;

export type Salle = {
  nom: string;
  adresse: string;
  ville: string;
  detail?: string;
  maps: string;
};

export const SALLES: Salle[] = [
  {
    nom: "Gymnase du Port",
    adresse: "6 rue du Port",
    ville: "94130 Nogent-sur-Marne",
    detail: "Porte 5",
    maps: "https://www.google.com/maps?q=6+rue+du+Port+94130+Nogent-sur-Marne&output=embed",
  },
  {
    nom: "Gymnase des Ormes",
    adresse: "Allée des Ormes",
    ville: "94170 Le Perreux-sur-Marne",
    maps: "https://www.google.com/maps?q=Allée+des+Ormes+94170+Le+Perreux-sur-Marne&output=embed",
  },
  {
    nom: "Gymnase du Marché",
    adresse: "62 av. Georges Clémenceau",
    ville: "94170 Le Perreux-sur-Marne",
    maps: "https://www.google.com/maps?q=62+avenue+Georges+Clemenceau+94170+Le+Perreux-sur-Marne&output=embed",
  },
];

export type Creneau = {
  jour: string;
  heure: string;
  cours: string;
  public: string;
};

export const HORAIRES: Creneau[] = [
  { jour: "Lundi", heure: "18h00 – 19h30", cours: "Boxe Française", public: "Enfants" },
  { jour: "Lundi", heure: "19h30 – 21h00", cours: "Boxe Française", public: "Adultes" },
  { jour: "Mardi", heure: "18h00 – 19h30", cours: "Boxe Française", public: "Enfants" },
  { jour: "Mardi", heure: "19h30 – 21h00", cours: "Boxe Française", public: "Adultes" },
  { jour: "Mardi", heure: "20h00", cours: "Préparation Physique", public: "Tous niveaux" },
  { jour: "Mercredi", heure: "18h00 – 19h30", cours: "Boxe Française", public: "Enfants" },
  { jour: "Mercredi", heure: "18h30 – 19h30", cours: "Savate Fitness", public: "Tous niveaux" },
  { jour: "Mercredi", heure: "19h30 – 21h00", cours: "Boxe Française", public: "Adultes" },
  { jour: "Jeudi", heure: "18h00 – 19h30", cours: "Boxe Française", public: "Enfants" },
  { jour: "Jeudi", heure: "19h30 – 21h00", cours: "Boxe Française", public: "Adultes" },
  { jour: "Jeudi", heure: "20h00", cours: "Préparation Physique", public: "Tous niveaux" },
  { jour: "Vendredi", heure: "18h00 – 19h30", cours: "Boxe Française", public: "Enfants" },
  { jour: "Vendredi", heure: "19h30 – 21h00", cours: "Boxe Française", public: "Adultes" },
];

export const EQUIPEMENT = [
  { item: "Gants de boxe", detail: "12 à 16 oz selon le gabarit — prêtés lors de la séance d'essai" },
  { item: "Protège-dents", detail: "Indispensable dès l'assaut, moulable de préférence" },
  { item: "Bandes de maintien", detail: "Pour protéger les poignets et les articulations" },
  { item: "Chaussures de savate", detail: "Semelle plate et souple, propres et réservées à la salle" },
  { item: "Tenue de sport", detail: "Près du corps, permettant l'aisance des mouvements" },
  { item: "Corde à sauter", detail: "Pour l'échauffement et le travail du cardio" },
  { item: "Coquille / protège-poitrine", detail: "Selon le niveau de pratique et les assauts" },
  { item: "Gourde", detail: "Hydratation tout au long de la séance" },
];

export const ACTIVITES = [
  {
    slug: "boxe-francaise",
    titre: "Boxe Française",
    sousTitre: "Savate · le sport de combat à la française",
    image: "/images/IMG_0558.jpg",
    inclus: true,
    tag: "Package Boxe Classique",
    resume:
      "Discipline pieds-poings élégante et complète, la Boxe Française allie technique, vitesse et stratégie. Pour tous les âges, du débutant au compétiteur.",
    points: [
      "Enfants : 18h00 – 19h30 · Adultes : 19h30 – 21h00",
      "5 cours par semaine, sur 2 salles",
      "Tous niveaux, dès 5 ans",
      "Encadrement par des moniteurs fédéraux",
    ],
    creneaux: [
      "Lun → Ven 18h00 (enfants)",
      "Lun → Ven 19h30 (adultes)",
    ],
  },
  {
    slug: "savate-fitness",
    titre: "Savate Fitness",
    sousTitre: "La boxe en musique, cardio & tonus",
    image: "/images/IMG_0544.jpg",
    inclus: true,
    tag: "Package Savate & Forme",
    resume:
      "Un cours dynamique qui reprend les gestes de la savate sur fond musical. Cardio, renforcement et défoulement garanti, sans contact. Orienté remise en forme.",
    points: [
      "Cours collectif en musique, mixte tous niveaux",
      "Renforcement musculaire et travail cardio",
      "Inclus dans le package Savate & Forme",
    ],
    creneaux: ["Mercredi 18h30 – 19h30"],
  },
  {
    slug: "preparation-physique",
    titre: "Préparation Physique",
    sousTitre: "Puissance, cardio & conditionnement",
    image: "/images/IMG_0548.jpg",
    inclus: false,
    tag: "Option Boxe Classique · incluse en Savate & Forme",
    resume:
      "Deux séances hebdomadaires de renforcement musculaire et de cardio pour développer puissance et explosivité. En option (+100€) avec la Boxe Classique, incluse dans le package Savate & Forme.",
    points: [
      "2 séances par semaine (mardi & jeudi 20h)",
      "Renforcement musculaire + cardio intensif",
      "Option +100€ avec Boxe Classique · incluse en Savate & Forme",
    ],
    creneaux: ["Mardi 20h00", "Jeudi 20h00"],
  },
];

// Les deux formules proposées au club.
export const PACKAGES = [
  {
    id: "boxe_classique" as const,
    nom: "Boxe Classique",
    accroche: "L'apprentissage complet de la Boxe Française, enfants et adultes.",
    tarifs: { adulte: 430, jeune: 410 },
    inclus: [
      "Tous les cours de Boxe Française (enfants ET adultes)",
      "5 cours par semaine, sur 2 salles",
      "Enfants 18h00 – 19h30 · Adultes 19h30 – 21h00",
      "Licence fédérale incluse",
    ],
    option: "+100€/an : ajouter la Préparation Physique (mardi & jeudi 20h)",
    orientation: "Technique & compétition",
  },
  {
    id: "savate_forme" as const,
    nom: "Savate & Forme",
    accroche: "La remise en forme par la savate, sans esprit de compétition.",
    tarifs: { adulte: 430, jeune: 410 },
    inclus: [
      "Savate Fitness (mercredi 18h30 – 19h30)",
      "Préparation Physique (mardi & jeudi 20h)",
      "Cardio, renforcement et tonus",
      "Licence fédérale incluse",
    ],
    option: null,
    orientation: "Fitness & remise en forme",
  },
];

export const POURQUOI = [
  {
    titre: "Un club historique",
    texte: "Plus de 25 ans au cœur du Val-de-Marne, avec une communauté fidèle de 300+ adhérents chaque saison.",
  },
  {
    titre: "Tous niveaux, tous âges",
    texte: "Enfants dès 5 ans, ados, adultes, femmes et hommes : chacun trouve sa place et progresse à son rythme.",
  },
  {
    titre: "Encadrement diplômé",
    texte: "Des professeurs et moniteurs fédéraux, dirigés par Pascal Bouchoucha, B.E.E.S 1er degré.",
  },
  {
    titre: "Deux formules au choix",
    texte: "Boxe Classique pour la pratique et la compétition, Savate & Forme pour la remise en forme. À chacun sa voie.",
  },
];

export const NAV_LINKS = [
  { href: "/", label: "Accueil" },
  { href: "/activites", label: "Activités" },
  { href: "/equipe", label: "Équipe" },
  { href: "/infos", label: "Infos & Tarifs" },
  { href: "/contact", label: "Contact" },
];
