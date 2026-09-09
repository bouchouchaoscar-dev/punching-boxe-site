import type { Adherent } from "@/lib/types";
import { remiseFamillePct } from "@/lib/pricing";
import type { FicheData } from "./types";

// SOURCE UNIQUE des champs de FicheData dérivés du DOSSIER (formule, montant,
// adhésion, remise, tarif libre, période). Réutilisée par le client (mode
// complétion), l'endpoint de complétion et la re-signature → aucune route ne
// peut diverger (ex. oublier `tarifLibre` ou afficher le tarif de grille au
// lieu du montant serveur). Ne couvre PAS les champs saisis au moment de la
// signature (date de naissance, contacts, représentant légal, signature).
export type FicheBase = Pick<
  FicheData,
  | "nom"
  | "prenom"
  | "email"
  | "packageType"
  | "optionPrepa"
  | "montantTotal"
  | "adhesionDue"
  | "remisePct"
  | "tarifLibre"
  | "dateDebut"
  | "dateFin"
>;

export function ficheBaseDepuisAdherent(a: Adherent): FicheBase {
  return {
    nom: a.nom,
    prenom: a.prenom,
    email: a.email,
    packageType: a.package,
    optionPrepa: a.option_prepa_physique ?? false,
    montantTotal: a.montant_total, // ← montant SERVEUR (tarif libre figé)
    adhesionDue: a.nouveau_membre,
    remisePct: remiseFamillePct(a.nb_membres_famille ?? 0),
    tarifLibre: a.tarif_libre === true,
    dateDebut: a.date_debut,
    dateFin: a.date_fin,
  };
}
