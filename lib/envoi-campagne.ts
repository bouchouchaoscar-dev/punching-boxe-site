import type { SupabaseClient } from "@supabase/supabase-js";
import { getResendClient, MAIL_FROM, renderCampagne } from "./email";
import {
  filtrerAdherents,
  filtrerAnciens,
  remplacerVariables,
  regrouperParEmail,
  formuleLabel,
  disciplinesLabel,
  SMART_LISTS,
  SEGMENTS_ANCIENS,
  DISCIPLINES,
  type SmartListKey,
  type SegmentAncienKey,
  type DisciplineKey,
  type AncienRecence,
  type PersonneEnvoi,
} from "./campagnes";
import { saisonCourante } from "./saison";
import type { Adherent } from "./types";

// Recette d'une campagne : la cible (segments/listes) + le message. C'est ce qui
// est stocké pour une campagne PLANIFIÉE et rejoué au jour J → segment recalculé.
export type RecetteCampagne = {
  objet: string;
  contenu: string;
  smartLists?: SmartListKey[];
  anciensSegments?: SegmentAncienKey[];
  disciplines?: DisciplineKey[];
  includeContacts?: boolean;
  manualEmails?: string[];
};

export type ResultatEnvoi = {
  ok: boolean;
  error?: string;
  emailsEnvoyes: number;
  personnesCiblees: number;
  doublons: number;
  exclus: number; // désinscrits (personnes)
  exclusSansEmail: number;
  destinatairesListe: {
    email: string;
    personnes: { prenom: string | null; nom: string | null }[];
  }[];
  cible: string;
};

function chunk<T>(arr: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

/** Résumé lisible de la cible (segments/listes) pour l'historique. */
export function resumeCible(r: RecetteCampagne): string {
  const parts: string[] = [];
  for (const k of r.smartLists ?? [])
    parts.push(SMART_LISTS.find((s) => s.key === k)?.label ?? k);
  for (const s of r.anciensSegments ?? [])
    parts.push(SEGMENTS_ANCIENS.find((x) => x.key === s)?.label ?? s);
  if ((r.disciplines ?? []).length > 0)
    parts.push(
      (r.disciplines ?? [])
        .map((d) => DISCIPLINES.find((x) => x.key === d)?.label ?? d)
        .join(" / "),
    );
  if (r.includeContacts) parts.push("Contacts importés");
  if ((r.manualEmails ?? []).length > 0)
    parts.push(`${(r.manualEmails ?? []).length} email(s) manuel(s)`);
  return parts.join(" · ") || "Personnalisé";
}

/**
 * Source + envoie une campagne. UNIQUE chemin d'envoi (manuel ET planifié) :
 * dédoublonnage par personne (étage 1) + regroupement par email familles
 * (étage 2) + exclusion désinscrits + rendu gabarit + Resend. Les segments sont
 * recalculés à l'instant de l'appel (donc « au jour J » pour une planifiée).
 */
export async function envoyerCampagne(
  supabase: SupabaseClient,
  recette: RecetteCampagne,
): Promise<ResultatEnvoi> {
  const objet = (recette.objet || "").trim();
  const contenu = (recette.contenu || "").trim();
  const cible = resumeCible(recette);
  const vide: ResultatEnvoi = {
    ok: false,
    emailsEnvoyes: 0,
    personnesCiblees: 0,
    doublons: 0,
    exclus: 0,
    exclusSansEmail: 0,
    destinatairesListe: [],
    cible,
  };

  if (!objet || !contenu) return { ...vide, error: "Objet et contenu requis." };
  const resend = getResendClient();
  if (!resend) return { ...vide, error: "RESEND_API_KEY non configuré." };

  const saisonRef = saisonCourante(new Date()); // {{saison}} = saison en cours

  // ---- Étage 1 : dédoublonnage par PERSONNE ----
  const personnes = new Map<string, PersonneEnvoi>();
  let totalAvant = 0;
  const addPersonne = (p: PersonneEnvoi) => {
    const email = p.email.trim().toLowerCase();
    if (!email) return;
    totalAvant++;
    if (!personnes.has(p.personKey)) personnes.set(p.personKey, { ...p, email });
  };

  const smartLists = recette.smartLists ?? [];
  const manualEmails = (recette.manualEmails ?? []).map((e) => e.toLowerCase());
  const anciensSegments = recette.anciensSegments ?? [];
  const disciplines = recette.disciplines ?? [];

  let adherents: Adherent[] = [];
  if (smartLists.length > 0 || manualEmails.length > 0) {
    const { data } = await supabase.from("adherents").select("*");
    adherents = (data ?? []) as Adherent[];
  }
  const adherentPersonne = (a: Adherent): PersonneEnvoi => ({
    personKey: `natif:${a.id}`,
    email: a.email,
    prenom: a.prenom,
    nom: a.nom,
    formule: formuleLabel(a.package),
    montant: a.montant_total,
    saison: a.saison || saisonRef,
    derniere_saison: "",
    disciplines: formuleLabel(a.package),
  });

  if (smartLists.length > 0) {
    for (const a of filtrerAdherents(adherents, smartLists))
      addPersonne(adherentPersonne(a));
  }
  if (manualEmails.length > 0) {
    const byEmail = new Map(adherents.map((a) => [a.email.toLowerCase(), a]));
    for (const e of manualEmails) {
      const a = byEmail.get(e);
      if (a) addPersonne(adherentPersonne(a));
      else addPersonne({ personKey: `email:${e}`, email: e, saison: saisonRef });
    }
  }
  if (recette.includeContacts) {
    const { data } = await supabase
      .from("contacts_mailing")
      .select("id, email, prenom, nom");
    for (const c of data ?? [])
      addPersonne({
        personKey: `contact:${c.id}`,
        email: c.email,
        prenom: c.prenom,
        nom: c.nom,
        saison: saisonRef,
      });
  }

  let exclusSansEmail = 0;
  if (anciensSegments.length > 0) {
    const { data: rec } = await supabase
      .from("anciens_recence")
      .select("id, nom, prenom, email, derniere_saison, disciplines");
    const anciens = (rec ?? []) as AncienRecence[];
    const { data: migr } = await supabase
      .from("adherents")
      .select("ancien_id")
      .not("ancien_id", "is", null);
    const migres = new Set((migr ?? []).map((m) => m.ancien_id as string));
    for (const a of filtrerAnciens(anciens, anciensSegments, disciplines, saisonRef)) {
      if (migres.has(a.id)) continue;
      if (!a.email || !a.email.trim()) {
        exclusSansEmail++;
        continue;
      }
      addPersonne({
        personKey: `ancien:${a.id}`,
        email: a.email,
        prenom: a.prenom,
        nom: a.nom,
        saison: saisonRef,
        derniere_saison: a.derniere_saison ?? "",
        disciplines: disciplinesLabel(a.disciplines),
        formule: disciplinesLabel(a.disciplines),
      });
    }
  }

  const doublons = totalAvant - personnes.size;

  // Exclusion RGPD au niveau email.
  const { data: optouts } = await supabase
    .from("desinscriptions_mailing")
    .select("email");
  const desinscrits = new Set(
    (optouts ?? []).map((o) => String(o.email).toLowerCase()),
  );

  // ---- Étage 2 : regroupement par EMAIL (familles préservées) ----
  const { envois, personnesExclues } = regrouperParEmail(
    [...personnes.values()],
    desinscrits,
    saisonRef,
  );

  if (envois.length === 0) {
    return {
      ...vide,
      doublons,
      exclus: personnesExclues,
      exclusSansEmail,
      error: "Aucun destinataire (liste vide ou tous désinscrits).",
    };
  }

  const personnesCiblees = envois.reduce((s, e) => s + e.personnes.length, 0);

  let emailsEnvoyes = 0;
  for (const lot of chunk(envois, 50)) {
    const emails = lot.map((e) => ({
      from: MAIL_FROM,
      to: e.email,
      subject: remplacerVariables(objet, e.vars),
      html: renderCampagne(remplacerVariables(contenu, e.vars), e.email),
    }));
    const { error } = await resend.batch.send(emails);
    if (!error) emailsEnvoyes += lot.length;
    else console.error("Resend batch error:", error);
  }

  const destinatairesListe = envois.map((e) => ({
    email: e.email,
    personnes: e.personnes.map((p) => ({
      prenom: p.prenom ?? null,
      nom: p.nom ?? null,
    })),
  }));

  return {
    ok: emailsEnvoyes > 0,
    emailsEnvoyes,
    personnesCiblees,
    doublons,
    exclus: personnesExclues,
    exclusSansEmail,
    destinatairesListe,
    cible,
  };
}
