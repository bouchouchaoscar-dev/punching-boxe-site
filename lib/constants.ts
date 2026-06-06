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
  telephone: "07 60 83 98 30",
  telephoneHref: "+33760839830",
  email: "contact@punching-boxe.com",
  adresse: "19 bis rue Paul Bert, 94130 Nogent-sur-Marne",
  directeur: "Pascal BOUCHOUCHA",
  directeurTitre: "Professeur fédéral · B.E.E.S 1er degré",
  saison: "2026-2027",
  facebook: "https://www.facebook.com/",
  instagram: "https://www.instagram.com/",
} as const;

export const STATS = [
  { value: 200, suffix: "+", label: "Adhérents par saison" },
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
    nom: "Gymnase du Centre",
    adresse: "62 av. Georges Clémenceau",
    ville: "94170 Le Perreux-sur-Marne",
    maps: "https://www.google.com/maps?q=62+avenue+Georges+Clemenceau+94170+Le+Perreux-sur-Marne&output=embed",
  },
  {
    nom: "Dojo David Douillet",
    adresse: "19 bis rue Paul Bert",
    ville: "94130 Nogent-sur-Marne",
    maps: "https://www.google.com/maps?q=19+bis+rue+Paul+Bert+94130+Nogent-sur-Marne&output=embed",
  },
];

export type Creneau = {
  jour: string;
  heure: string;
  cours: string;
  public: string;
  salle: string;
  ville: string;
};

const NOGENT = "Nogent-sur-Marne";
const PERREUX = "Le Perreux-sur-Marne";

export const HORAIRES: Creneau[] = [
  // Lundi
  { jour: "Lundi", heure: "19h00 – 20h30", cours: "Boxe Française", public: "Adultes", salle: "Dojo David Douillet", ville: NOGENT },
  // Mardi
  { jour: "Mardi", heure: "18h00 – 19h00", cours: "Boxe Française", public: "Enfants", salle: "Dojo David Douillet", ville: NOGENT },
  { jour: "Mardi", heure: "19h30 – 21h00", cours: "Boxe Française", public: "Adultes", salle: "Dojo David Douillet", ville: NOGENT },
  { jour: "Mardi", heure: "20h00 – 21h00", cours: "Préparation Physique", public: "Tous niveaux", salle: "Gymnase du Port", ville: NOGENT },
  // Mercredi
  { jour: "Mercredi", heure: "17h00 – 18h00", cours: "Boxe Française", public: "Enfants", salle: "Gymnase du Centre", ville: PERREUX },
  { jour: "Mercredi", heure: "18h30 – 19h30", cours: "Savate Fitness", public: "Tous niveaux", salle: "Gymnase du Centre", ville: PERREUX },
  { jour: "Mercredi", heure: "19h30 – 21h00", cours: "Boxe Française", public: "Adultes", salle: "Gymnase du Centre", ville: PERREUX },
  // Jeudi
  { jour: "Jeudi", heure: "18h00 – 19h00", cours: "Boxe Française", public: "Enfants", salle: "Dojo David Douillet", ville: NOGENT },
  { jour: "Jeudi", heure: "19h30 – 21h00", cours: "Boxe Française", public: "Adultes", salle: "Dojo David Douillet", ville: NOGENT },
  { jour: "Jeudi", heure: "20h00 – 21h00", cours: "Préparation Physique", public: "Tous niveaux", salle: "Gymnase du Port", ville: NOGENT },
  // Vendredi
  { jour: "Vendredi", heure: "17h30 – 18h30", cours: "Boxe Française", public: "Enfants", salle: "Gymnase du Centre", ville: PERREUX },
  { jour: "Vendredi", heure: "19h00 – 20h30", cours: "Boxe Française", public: "Adultes", salle: "Gymnase du Centre", ville: PERREUX },
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
    tag: "Formule Boxe Française",
    resume:
      "Discipline pieds-poings élégante et complète, la Boxe Française allie technique, vitesse et stratégie. Pour tous les âges, du débutant au compétiteur.",
    points: [
      "Cours Enfants (1h) et Adultes (1h30)",
      "Adultes : 5 cours/semaine · Enfants : 4 cours/semaine",
      "Sur 4 salles, dès 5 ans",
      "Encadrement par des moniteurs fédéraux",
    ],
    creneaux: [
      "Enfants : Mar · Mer · Jeu · Ven",
      "Adultes : Lun → Ven",
      "4 salles d'entraînement",
    ],
  },
  {
    slug: "savate-fitness",
    titre: "Savate Fitness",
    sousTitre: "La boxe en musique, cardio et tonus",
    image: "/images/IMG_0544.jpg",
    inclus: true,
    tag: "Formule Savate et Prépa",
    resume:
      "Un cours dynamique qui reprend les gestes de la savate sur fond musical. Cardio, renforcement et défoulement garanti, sans contact. Orienté remise en forme.",
    points: [
      "Cours collectif en musique, mixte tous niveaux",
      "Renforcement musculaire et travail cardio",
      "Inclus dans le package Savate et Prépa",
    ],
    creneaux: ["Mercredi 18h30 – 19h30"],
  },
  {
    slug: "preparation-physique",
    titre: "Préparation Physique",
    sousTitre: "Puissance, cardio et conditionnement",
    image: "/images/IMG_0548.jpg",
    inclus: false,
    tag: "Formule Savate et Prépa",
    resume:
      "Deux séances hebdomadaires de renforcement musculaire et de cardio pour développer puissance et explosivité. En option (+100€) avec la Boxe Française, incluse dans le package Savate et Prépa.",
    points: [
      "2 séances par semaine (mardi et jeudi 20h)",
      "Renforcement musculaire + cardio intensif",
      "Option +100€ avec Boxe Française · incluse en Savate et Prépa",
    ],
    creneaux: ["Mardi 20h00 – 21h00", "Jeudi 20h00 – 21h00"],
  },
];

// Les deux formules proposées au club.
export const PACKAGES = [
  {
    id: "boxe_classique" as const,
    nom: "Boxe Française",
    accroche: "L'apprentissage complet de la Boxe Française, enfants et adultes.",
    tarifs: { adulte: 430, jeune: 410 },
    inclus: [
      "Tous les cours de Boxe Française (enfants et adultes)",
      "Adultes : 5 cours/sem · Enfants : 4 cours/sem",
      "Sur 4 salles d'entraînement",
      "+30 € la première année pour les nouveaux membres",
    ],
    option: "+100€/an : ajouter la Préparation Physique (mardi et jeudi 20h)",
    orientation: "Technique et compétition",
  },
  {
    id: "savate_prepa" as const,
    nom: "Savate et Prépa",
    accroche: "La remise en forme par la savate, sans esprit de compétition.",
    tarifs: { adulte: 390, jeune: 370 },
    inclus: [
      "Savate Fitness (mercredi 18h30 – 19h30)",
      "Préparation Physique (mardi et jeudi 20h – 21h)",
      "3 cours par semaine",
      "+30 € la première année pour les nouveaux membres",
    ],
    option: null,
    orientation: "Fitness et remise en forme",
  },
];

export const POURQUOI = [
  {
    titre: "Un club historique",
    texte: "Plus de 25 ans au cœur du Val-de-Marne, avec une communauté fidèle de 200+ adhérents chaque saison.",
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
    texte: "Boxe Française pour la pratique et la compétition, Savate et Prépa pour la remise en forme. À chacun sa voie.",
  },
];

export const NAV_LINKS = [
  { href: "/", label: "Accueil" },
  { href: "/activites", label: "Activités" },
  { href: "/equipe", label: "Équipe" },
  { href: "/infos", label: "Infos et Tarifs" },
  { href: "/contact", label: "Contact" },
];
