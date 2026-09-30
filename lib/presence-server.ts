// Helpers SERVEUR du module Présence (I/O Supabase). Chargements partagés par
// les routes publiques / admin / coach. Aucune règle métier ici : la logique de
// fenêtre/rattachement vit dans lib/presence.ts (pur, testé).
import type { SupabaseClient } from "@supabase/supabase-js";
import { estMineur } from "./pricing";
import { normaliserEmail } from "./email-format";
import { saisonCourante } from "./saison";
import { disciplineLabel, publicLabel, type Cours, type PeriodeFermeture } from "./planning";
import type { CoursOuvert, ProfilPointage } from "./presence";

// Vue publique d'un cours ouvert (aucune donnée sensible) — partagée par les
// routes /api/presence/*.
export function coursPublic(o: CoursOuvert) {
  return {
    id: o.cours.id,
    libelle: o.cours.libelle,
    discipline: disciplineLabel(o.cours.discipline),
    public: publicLabel(o.cours.type_adherent),
    horaire: o.horaire,
    salle: o.cours.salle,
  };
}

// Champs adhérent nécessaires (statut trombi + rattachement + affichage admin).
export type DossierPresence = {
  id: string;
  prenom: string | null;
  nom: string | null;
  date_naissance: string | null;
  package: string | null;
  option_prepa_physique: boolean | null;
  photo_url: string | null;
  email: string | null;
  saison: string | null;
  statut_paiement: string | null;
  mode_paiement: string | null;
  nb_echeances: number | null;
  echeances_payees: number | null;
  engage_at: string | null;
  annule_at: string | null;
};

const CHAMPS_DOSSIER =
  "id, prenom, nom, date_naissance, package, option_prepa_physique, photo_url, email, saison, statut_paiement, mode_paiement, nb_echeances, echeances_payees, engage_at, annule_at";

/** Cours actifs + périodes de fermeture (base du calcul de fenêtre). */
export async function chargerPlanning(
  supabase: SupabaseClient,
): Promise<{ cours: Cours[]; periodes: PeriodeFermeture[] }> {
  const [{ data: cours }, { data: periodes }] = await Promise.all([
    supabase.from("cours").select("*"),
    supabase.from("periodes_fermeture").select("id, libelle, date_debut, date_fin"),
  ]);
  return { cours: (cours ?? []) as Cours[], periodes: (periodes ?? []) as PeriodeFermeture[] };
}

/** Dossiers de la saison courante NON arrêtés (annule_at is null). */
export async function dossiersSaison(
  supabase: SupabaseClient,
  saison: string,
): Promise<DossierPresence[]> {
  const { data } = await supabase
    .from("adherents")
    .select(CHAMPS_DOSSIER)
    .eq("saison", saison)
    .is("annule_at", null);
  return (data ?? []) as DossierPresence[];
}

/** Profil de rattachement d'un dossier (mineur + formule → discipline). */
export function profilDossier(d: DossierPresence): ProfilPointage {
  return {
    mineur: estMineur(d.date_naissance),
    pkg: d.package,
    optionPrepa: d.option_prepa_physique === true,
  };
}

/**
 * Cherche un dossier de la saison correspondant par email normalisé OU par
 * triplet nom/prénom/naissance (mêmes clés que la reconnaissance d'ancien).
 * Sert à l'anti-doublon essai→dossier et à la conversion des relances.
 */
export function trouverDossierCorrespondant(
  dossiers: DossierPresence[],
  p: { email?: string | null; nom?: string | null; prenom?: string | null; date_naissance?: string | null },
): DossierPresence | null {
  const email = normaliserEmail(p.email);
  if (email) {
    const parEmail = dossiers.find((d) => normaliserEmail(d.email) === email);
    if (parEmail) return parEmail;
  }
  const n = (s: string | null | undefined) =>
    (s ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();
  if (p.nom && p.prenom && p.date_naissance) {
    const parTriplet = dossiers.find(
      (d) => n(d.nom) === n(p.nom) && n(d.prenom) === n(p.prenom) && d.date_naissance === p.date_naissance,
    );
    if (parTriplet) return parTriplet;
  }
  return null;
}

// ---------------------------------------------------------------------------
// Attache une présence de type « essai » à un cours DÉJÀ RÉSOLU (source unique,
// partagée par la route publique /api/presence/essai et l'ajout admin). Règles :
//  - si l'email OU le triplet nom/prénom/naissance correspond à un dossier de la
//    saison → présence sur le DOSSIER (pas d'essai) ;
//  - sinon anti-doublon (même email + cours + date → essai réutilisé, une seule
//    série de relances) puis présence sur l'essai.
// Idempotent : un doublon (23505) est traité comme un succès.
// ---------------------------------------------------------------------------
export type AttacheEssaiResultat =
  | { ok: true; surDossier: boolean; dossierId?: string; essaiId?: string }
  | { ok: false; error: string };

export async function attacherPresenceEssai(
  supabase: SupabaseClient,
  p: {
    coursId: string;
    dateSeance: string;
    prenom: string;
    nom: string;
    date_naissance: string;
    email: string; // déjà normalisé
    source: "qr" | "manuel";
    createdBy?: string | null;
    dossiers?: DossierPresence[]; // évite un rechargement si déjà en main
  },
): Promise<AttacheEssaiResultat> {
  const dossiers = p.dossiers ?? (await dossiersSaison(supabase, saisonCourante(new Date())));
  const dossier = trouverDossierCorrespondant(dossiers, {
    email: p.email,
    nom: p.nom,
    prenom: p.prenom,
    date_naissance: p.date_naissance,
  });

  if (dossier) {
    const { error } = await supabase.from("presences").insert({
      cours_id: p.coursId,
      date_seance: p.dateSeance,
      dossier_id: dossier.id,
      source: p.source,
      created_by: p.createdBy ?? null,
    });
    if (error && error.code !== "23505") return { ok: false, error: "Enregistrement impossible." };
    return { ok: true, surDossier: true, dossierId: dossier.id };
  }

  // Anti-doublon essai (même email + cours + date).
  const { data: existant } = await supabase
    .from("essais")
    .select("id")
    .eq("email", p.email)
    .eq("cours_id", p.coursId)
    .eq("date_seance", p.dateSeance)
    .maybeSingle();

  let essaiId = existant?.id as string | undefined;
  if (!essaiId) {
    const { data: cree, error: eEssai } = await supabase
      .from("essais")
      .insert({ nom: p.nom, prenom: p.prenom, date_naissance: p.date_naissance, email: p.email, cours_id: p.coursId, date_seance: p.dateSeance })
      .select("id")
      .single();
    if (eEssai || !cree) return { ok: false, error: "Enregistrement impossible." };
    essaiId = cree.id;
  }

  const { error } = await supabase.from("presences").insert({
    cours_id: p.coursId,
    date_seance: p.dateSeance,
    essai_id: essaiId,
    source: p.source,
    created_by: p.createdBy ?? null,
  });
  if (error && error.code !== "23505") return { ok: false, error: "Enregistrement impossible." };
  return { ok: true, surDossier: false, essaiId };
}
