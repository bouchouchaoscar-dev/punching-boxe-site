// Helpers SERVEUR du module Présence (I/O Supabase). Chargements partagés par
// les routes publiques / admin / coach. Aucune règle métier ici : la logique de
// fenêtre/rattachement vit dans lib/presence.ts (pur, testé).
import type { SupabaseClient } from "@supabase/supabase-js";
import { exigerData } from "./supabase";
import { estMineur } from "./pricing";
import { matchKey } from "./anciennete";
import { saisonCourante } from "./saison";
import { CONFIG_CLUB } from "./config-club";
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
  const data = exigerData(
    await supabase
      .from("adherents")
      .select(CHAMPS_DOSSIER)
      .eq("saison", saison)
      .is("annule_at", null),
    "dossiers saison",
  );
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
 * IDENTITÉ = nom + prénom + date de naissance, normalisés (SOURCE UNIQUE :
 * matchKey, la même clé que la reconnaissance d'ancien et le dédoublonnage
 * d'inscription — casse, accents, tirets, apostrophes, espaces). L'email ne sert
 * JAMAIS à identifier une personne (un email = souvent une FAMILLE).
 */
export function memeIdentite(
  a: { nom?: string | null; prenom?: string | null; date_naissance?: string | null },
  b: { nom?: string | null; prenom?: string | null; date_naissance?: string | null },
): boolean {
  const ka = matchKey(a.nom ?? "", a.prenom ?? "", a.date_naissance);
  const kb = matchKey(b.nom ?? "", b.prenom ?? "", b.date_naissance);
  return ka !== null && ka === kb;
}

/**
 * Cherche un dossier de la saison correspondant à une personne, UNIQUEMENT par le
 * triplet nom/prénom/naissance (jamais par email : sinon la présence d'un enfant
 * serait rattachée au dossier de son frère/sa sœur qui partage le même email).
 * Sert à l'anti-doublon essai→dossier et à la conversion des relances.
 */
export function trouverDossierCorrespondant(
  dossiers: DossierPresence[],
  p: { nom?: string | null; prenom?: string | null; date_naissance?: string | null },
): DossierPresence | null {
  const cle = matchKey(p.nom ?? "", p.prenom ?? "", p.date_naissance);
  if (!cle) return null;
  return dossiers.find((d) => matchKey(d.nom ?? "", d.prenom ?? "", d.date_naissance) === cle) ?? null;
}

/**
 * Retrait admin d'une présence. Si la présence est liée à un ESSAI et que c'était
 * sa DERNIÈRE présence, on supprime aussi la fiche d'essai (→ plus de relances) —
 * cohérent avec la modale de confirmation. Si l'essai a d'autres présences, seule
 * la présence est retirée. Une présence d'adhérent n'affecte jamais le dossier.
 * Idempotent (présence déjà retirée → ok).
 */
export async function retirerPresence(
  supabase: SupabaseClient,
  presenceId: string,
): Promise<{ ok: boolean; essaiSupprime: boolean; error?: string }> {
  const pres = exigerData(
    await supabase.from("presences").select("essai_id, dossier_id").eq("id", presenceId).maybeSingle(),
    "retirer: lecture présence",
  );
  if (!pres) return { ok: true, essaiSupprime: false }; // déjà retirée

  const { error: delErr } = await supabase.from("presences").delete().eq("id", presenceId);
  if (delErr) return { ok: false, essaiSupprime: false, error: "Retrait impossible." };

  const essaiId = (pres.essai_id as string | null) ?? null;
  if (!essaiId) return { ok: true, essaiSupprime: false }; // présence d'adhérent

  // Reste-t-il des présences pour cet essai ? Si non → suppression de l'essai.
  const { count, error: cErr } = await supabase
    .from("presences")
    .select("id", { count: "exact", head: true })
    .eq("essai_id", essaiId);
  if (cErr) return { ok: true, essaiSupprime: false }; // présence déjà retirée, on n'échoue pas
  if ((count ?? 0) === 0) {
    await supabase.from("essais").delete().eq("id", essaiId);
    return { ok: true, essaiSupprime: true };
  }
  return { ok: true, essaiSupprime: false };
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
  | { ok: true; surDossier: boolean; dossierId?: string; essaiId?: string; dejaUtilise?: boolean; dateEssai?: string }
  | { ok: false; error: string };

// Essais déjà enregistrés pour une PERSONNE — identité par le triplet normalisé
// (matchKey), JAMAIS par email : deux enfants d'un même parent (même email) sont
// deux personnes distinctes. On charge les essais et on filtre sur la clé
// d'identité (gère aussi les variantes de saisie : casse, accents, tiret, espaces).
async function essaisDeLaPersonne(
  supabase: SupabaseClient,
  p: { nom: string; prenom: string; date_naissance: string },
): Promise<{ id: string; cours_id: string | null; date_seance: string }[]> {
  const cle = matchKey(p.nom, p.prenom, p.date_naissance);
  if (!cle) return [];
  const data = exigerData(
    await supabase.from("essais").select("id, cours_id, date_seance, nom, prenom, date_naissance"),
    "essais (identité)",
  );
  return (data ?? [])
    .filter((e) => matchKey(e.nom as string, e.prenom as string, e.date_naissance as string | null) === cle)
    .map((e) => ({ id: e.id as string, cours_id: (e.cours_id as string) ?? null, date_seance: e.date_seance as string }));
}

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
  // Rattachement au dossier existant : triplet UNIQUEMENT (jamais l'email).
  const dossier = trouverDossierCorrespondant(dossiers, {
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

  // Essais déjà faits par cette PERSONNE (triplet uniquement, jamais l'email).
  const personEssais = await essaisDeLaPersonne(supabase, { nom: p.nom, prenom: p.prenom, date_naissance: p.date_naissance });
  const exact = personEssais.find((e) => e.cours_id === p.coursId && e.date_seance === p.dateSeance);
  const autres = personEssais.filter((e) => e !== exact);
  const gratuits = CONFIG_CLUB.modules?.presence?.essaisGratuits ?? 1;
  const dejaUtilise = autres.length >= gratuits;

  let essaiId: string | undefined;
  let dateEssai: string | undefined;
  if (dejaUtilise) {
    // Quota d'essais atteint → on RÉUTILISE un essai existant (aucun nouvel essai,
    // aucune nouvelle série de relances) ; la présence est bien enregistrée.
    const cible = exact ?? [...personEssais].sort((a, b) => b.date_seance.localeCompare(a.date_seance))[0];
    essaiId = cible?.id;
    dateEssai = [...personEssais].sort((a, b) => a.date_seance.localeCompare(b.date_seance))[0]?.date_seance;
  } else {
    // Anti-doublon (même email + cours + date) sinon création d'un nouvel essai.
    essaiId = exact?.id;
    if (!essaiId) {
      const { data: cree, error: eEssai } = await supabase
        .from("essais")
        .insert({ nom: p.nom, prenom: p.prenom, date_naissance: p.date_naissance, email: p.email, cours_id: p.coursId, date_seance: p.dateSeance })
        .select("id")
        .single();
      if (eEssai || !cree) return { ok: false, error: "Enregistrement impossible." };
      essaiId = cree.id;
    }
  }
  if (!essaiId) return { ok: false, error: "Enregistrement impossible." };

  const { error } = await supabase.from("presences").insert({
    cours_id: p.coursId,
    date_seance: p.dateSeance,
    essai_id: essaiId,
    source: p.source,
    created_by: p.createdBy ?? null,
  });
  if (error && error.code !== "23505") return { ok: false, error: "Enregistrement impossible." };
  return { ok: true, surDossier: false, essaiId, dejaUtilise, dateEssai };
}
