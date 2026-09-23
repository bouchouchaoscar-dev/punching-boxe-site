// ============================================================================
// CONFIG CLUB UNIQUE — valeurs spécifiques au club (versionnées).
// Un nouveau club se configure ICI (identité, seuils, tarifs) sans toucher au
// moteur (lib/pricing.ts, lib/tarifs.ts) ni au reste du socle.
//
// FRONTIÈRE : ce fichier ne contient que des VALEURS. Toute la LOGIQUE de calcul
// reste dans le socle et LIT ces valeurs. Les secrets/URLs restent en variables
// d'ENVIRONNEMENT (jamais ici).
//
// Les types importés de pricing sont TYPE-ONLY (effacés au runtime) → aucune
// dépendance circulaire : pricing importe la VALEUR CONFIG_CLUB, config-club
// n'importe que des types.
// ============================================================================
import type { PackageType, MoisPalier, RemiseFamilleConfig } from "./pricing";

// Cotisation plein tarif (sept/oct/nov). Référencée par les paliers → source
// unique : changer le plein met à jour ces 3 mois (comportement d'origine).
const COTISATION_PLEIN: Record<PackageType, { adulte: number; jeune: number }> = {
  boxe_classique: { adulte: 430, jeune: 410 },
  savate_prepa: { adulte: 350, jeune: 330 },
};
const PREPA_PLEIN = 70;

export const CONFIG_CLUB = {
  // -- IDENTITÉ ------------------------------------------------------------
  identite: {
    // Signataire des documents PDF (facture/attestation). SOURCE UNIQUE du
    // nom + titre + ville (fin de l'incohérence : le titre n'existait qu'en dur
    // dans le PDF sous « Directeur Sportif » → valeur retenue ici).
    signataire: {
      nom: "Pascal Bouchoucha",
      titre: "Directeur Sportif",
      ville: "Nogent-sur-Marne",
    },
    // Charte couleur pour les graphes (JS/Recharts). Miroir des tokens de
    // app/globals.css @theme (--color-orange / --color-ink) — un nouveau club
    // change les deux endroits (CSS pour l'UI, ici pour les graphes).
    couleurs: { orange: "#FF6B00", ink: "#0A0A0A" },
  },

  // -- MODULES OPTIONNELS --------------------------------------------------
  // Chaque module se coupe/active ICI par club. Les données restent en base
  // (aucun spécifique en dur) ; un flag false masque l'onglet admin et fait
  // renvoyer 404 aux routes du module.
  modules: {
    planning: {
      actif: true, // Calendrier hebdo des cours + profs + affectations + mail au prof.
      // Couleurs des cours (paramétrable par club). `disciplines` = couleur de
      // repli par discipline ; `couples` = surcharge fine par discipline:public
      // (clé "<discipline>:<public>"). Public "Tous" → couleur de la discipline.
      // bg = fond pâle de la carte, bar = liseré d'accent. Texte toujours foncé.
      couleurs: {
        disciplines: {
          boxe_francaise: { bg: "#fff4ec", bar: "#f84800" }, // rouge/orange charte
          savate: { bg: "#eef2ff", bar: "#4f46e5" }, // indigo
          prepa_physique: { bg: "#ecfdf5", bar: "#059669" }, // vert
        } as Record<string, { bg: string; bar: string }>,
        couples: {
          "boxe_francaise:jeune": { bg: "#fef8e7", bar: "#d97706" }, // ambre (texte foncé)
        } as Record<string, { bg: string; bar: string }>,
      },
    },
  },

  // -- SEUILS COMPORTEMENTAUX ---------------------------------------------
  seuils: {
    adhesionGapAns: 4, // gap ≥ N saisons → re-facturer l'adhésion (froid)
    jeuneAns: 13, // < N ans = tarif « jeune » (SOURCE UNIQUE, cf. pricing + anciennete)
    // Délais des relances du cron charge-echeances, en HEURES.
    relances: {
      panierH: 24, // 1ère relance panier abandonné (dossier carte non finalisé)
      panier2H: 48, // 2e relance panier : au moins N h APRÈS la 1ère
      echecH: 48, // rappel unique après un échec de prélèvement
      compteSansInscriptionH: 24, // relance compte Auth sans aucun dossier
    },
  },

  // -- TARIFS (VALEURS ; le moteur de calcul reste dans lib/pricing.ts) -----
  tarifs: {
    adhesion: 30, // 1ère année uniquement (nouveau membre)
    prepaPhysique: PREPA_PLEIN, // option prépa plein tarif
    cotisation: COTISATION_PLEIN, // plein tarif par formule × type
    // Cotisation FIXE par mois d'inscription (dégressive). sept/oct/nov = plein.
    cotisationPaliers: {
      sept: COTISATION_PLEIN,
      oct: COTISATION_PLEIN,
      nov: COTISATION_PLEIN,
      dec: { boxe_classique: { adulte: 375, jeune: 355 }, savate_prepa: { adulte: 305, jeune: 285 } },
      jan: { boxe_classique: { adulte: 320, jeune: 300 }, savate_prepa: { adulte: 260, jeune: 240 } },
      fev: { boxe_classique: { adulte: 265, jeune: 250 }, savate_prepa: { adulte: 215, jeune: 200 } },
      mars: { boxe_classique: { adulte: 210, jeune: 200 }, savate_prepa: { adulte: 170, jeune: 160 } },
      avr: { boxe_classique: { adulte: 155, jeune: 150 }, savate_prepa: { adulte: 125, jeune: 120 } },
      mai: { boxe_classique: { adulte: 100, jeune: 95 }, savate_prepa: { adulte: 80, jeune: 75 } },
      juin: { boxe_classique: { adulte: 50, jeune: 50 }, savate_prepa: { adulte: 50, jeune: 50 } },
    } as Record<MoisPalier, Record<PackageType, { adulte: number; jeune: number }>>,
    // Option prépa (Boxe Française) — dégressive : sept→fév = plein ; mars/avr/mai = 35 ; juin = 10.
    prepaPaliers: {
      sept: PREPA_PLEIN,
      oct: PREPA_PLEIN,
      nov: PREPA_PLEIN,
      dec: PREPA_PLEIN,
      jan: PREPA_PLEIN,
      fev: PREPA_PLEIN,
      mars: 35,
      avr: 35,
      mai: 35,
      juin: 10,
    } as Record<MoisPalier, number>,
    // Remise famille (défaut boxe : 3e −10 %, 4e −15 %, 5e+ −20 %).
    remiseFamille: { type: "pourcentage", paliers: { 3: 10, 4: 15, 5: 20 } } as RemiseFamilleConfig,
  },
};
