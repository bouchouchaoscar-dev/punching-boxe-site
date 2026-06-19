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

export type EnvoiResultat = {
  email: string;
  prenom: string | null;
  nom: string | null;
  statut: "envoye" | "echec";
  erreur?: string;
};

export type ResultatEnvoi = {
  ok: boolean;
  error?: string;
  emailsEnvoyes: number;
  emailsEchoues: number; // emails en échec (après retry)
  personnesCiblees: number;
  doublons: number;
  exclus: number; // désinscrits (personnes)
  exclusSansEmail: number;
  destinatairesListe: {
    email: string;
    personnes: { prenom: string | null; nom: string | null }[];
  }[];
  resultats: EnvoiResultat[]; // suivi par destinataire (pour envois_mailing)
  cible: string;
};

/** Statut de campagne dérivé du résultat d'envoi (réalité, pas faux positif). */
export function statutCampagne(r: ResultatEnvoi): "envoye" | "partiel" | "erreur" {
  if (r.emailsEnvoyes === 0) return "erreur";
  return r.emailsEchoues > 0 ? "partiel" : "envoye";
}

/** Persiste le suivi par destinataire (best-effort : n'échoue jamais l'envoi). */
export async function enregistrerEnvois(
  supabase: SupabaseClient,
  campagneId: string | null | undefined,
  resultats: EnvoiResultat[],
): Promise<void> {
  if (!campagneId || !resultats?.length) return;
  try {
    const rows = resultats.map((r) => ({
      campagne_id: campagneId,
      email: r.email,
      prenom: r.prenom,
      nom: r.nom,
      statut: r.statut,
      erreur: r.erreur ?? null,
    }));
    const { error } = await supabase.from("envois_mailing").insert(rows);
    if (error) console.error("envois_mailing insert (ignoré):", error.message);
  } catch (e) {
    console.error("envois_mailing insert (exception, ignoré):", e);
  }
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
    emailsEchoues: 0,
    personnesCiblees: 0,
    doublons: 0,
    exclus: 0,
    exclusSansEmail: 0,
    destinatairesListe: [],
    resultats: [],
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

  // Envoi UN PAR UN, avec pacing (rate-limit Resend = 5 req/s) et retry (1×) sur
  // 429. Les erreurs ne sont PLUS avalées : chaque destinataire a un résultat.
  const PACING_MS = 300; // ~3 req/s, marge sous le 5/s Resend
  let emailsEnvoyes = 0;
  let emailsEchoues = 0;
  const resultats: EnvoiResultat[] = [];

  for (let i = 0; i < envois.length; i++) {
    const e = envois[i];
    const payload = {
      from: MAIL_FROM,
      to: e.email,
      subject: remplacerVariables(objet, e.vars),
      html: renderCampagne(remplacerVariables(contenu, e.vars), e.email),
    };
    const prenom = e.vars.prenom ?? null;
    const nom = e.vars.nom ?? null;

    let envoye = false;
    let erreur: string | undefined;
    for (let tentative = 0; tentative < 2; tentative++) {
      const { error } = await resend.emails.send(payload);
      if (!error) { envoye = true; break; }
      const msg = (error as { message?: string }).message ?? String(error);
      const is429 =
        (error as { statusCode?: number }).statusCode === 429 ||
        /rate.?limit|too many|429/i.test(msg);
      if (is429 && tentative === 0) { await sleep(1000); continue; } // retry une fois
      erreur = msg;
      break;
    }

    if (envoye) { emailsEnvoyes++; resultats.push({ email: e.email, prenom, nom, statut: "envoye" }); }
    else {
      emailsEchoues++;
      resultats.push({ email: e.email, prenom, nom, statut: "echec", erreur });
      console.error("Envoi campagne — échec:", e.email, erreur);
    }
    if (i < envois.length - 1) await sleep(PACING_MS);
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
    emailsEchoues,
    personnesCiblees,
    doublons,
    exclus: personnesExclues,
    exclusSansEmail,
    destinatairesListe,
    resultats,
    cible,
  };
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
