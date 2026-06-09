import { NextResponse } from "next/server";
import { getSupabaseAdmin, isSupabaseConfigured } from "@/lib/supabase";
import { isAdminRequest } from "@/lib/admin-guard";
import {
  getResendClient,
  MAIL_FROM,
  renderCampagne,
} from "@/lib/email";
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
} from "@/lib/campagnes";
import { saisonCourante } from "@/lib/saison";
import type { Adherent } from "@/lib/types";

export const runtime = "nodejs";

function chunk<T>(arr: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

export async function POST(request: Request) {
  if (!isAdminRequest(request)) {
    return NextResponse.json({ error: "Non autorisé." }, { status: 401 });
  }
  if (!isSupabaseConfigured()) {
    return NextResponse.json({ error: "Supabase non configuré." }, { status: 503 });
  }

  let body: {
    titre?: string;
    objet?: string;
    contenu?: string;
    smartLists?: SmartListKey[];
    anciensSegments?: SegmentAncienKey[];
    disciplines?: DisciplineKey[];
    includeContacts?: boolean;
    manualEmails?: string[];
  };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Corps invalide." }, { status: 400 });
  }

  const objet = (body.objet || "").trim();
  const contenu = (body.contenu || "").trim();
  if (!objet || !contenu) {
    return NextResponse.json({ error: "Objet et contenu requis." }, { status: 400 });
  }

  const resend = getResendClient();
  if (!resend) {
    return NextResponse.json(
      { error: "Envoi impossible : RESEND_API_KEY non configuré." },
      { status: 503 },
    );
  }

  const supabase = getSupabaseAdmin();
  const saisonRef = saisonCourante(new Date()); // {{saison}} = saison en cours

  // ---- Étage 1 : dédoublonnage par PERSONNE (clé d'identité, pas l'email) ----
  // Fusionne les VRAIS doublons (même personne captée par 2 listes) sans écraser
  // les familles (personnes différentes partageant une même adresse email).
  const personnes = new Map<string, PersonneEnvoi>();
  let totalAvant = 0;
  const addPersonne = (p: PersonneEnvoi) => {
    const email = p.email.trim().toLowerCase();
    if (!email) return;
    totalAvant++;
    if (!personnes.has(p.personKey)) personnes.set(p.personKey, { ...p, email });
  };

  // 1) Listes intelligentes (adhérents).
  const smartLists = body.smartLists ?? [];
  const manualEmails = (body.manualEmails ?? []).map((e) => e.toLowerCase());
  const needAdherents = smartLists.length > 0 || manualEmails.length > 0;

  let adherents: Adherent[] = [];
  if (needAdherents) {
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

  // 2) Sélection manuelle (emails d'adhérents ou emails libres).
  if (manualEmails.length > 0) {
    const byEmail = new Map(adherents.map((a) => [a.email.toLowerCase(), a]));
    for (const e of manualEmails) {
      const a = byEmail.get(e);
      if (a) addPersonne(adherentPersonne(a));
      else addPersonne({ personKey: `email:${e}`, email: e, saison: saisonRef });
    }
  }

  // 3) Contacts importés.
  if (body.includeContacts) {
    const { data } = await supabase
      .from("contacts_mailing")
      .select("id, email, prenom, nom");
    for (const c of data ?? []) {
      addPersonne({
        personKey: `contact:${c.id}`,
        email: c.email,
        prenom: c.prenom,
        nom: c.nom,
        saison: saisonRef,
      });
    }
  }

  // 4) Segments ANCIENS (non-natifs), classés dynamiquement (vue anciens_recence).
  const anciensSegments = body.anciensSegments ?? [];
  const disciplines = body.disciplines ?? [];
  let exclusSansEmail = 0;
  if (anciensSegments.length > 0) {
    const { data: rec } = await supabase
      .from("anciens_recence")
      .select("id, nom, prenom, email, derniere_saison, disciplines");
    const anciens = (rec ?? []) as AncienRecence[];
    // Un ancien RÉINSCRIT (référencé par adherents.ancien_id) est représenté par
    // son dossier natif → on l'exclut du sourcing anciens.
    const { data: migr } = await supabase
      .from("adherents")
      .select("ancien_id")
      .not("ancien_id", "is", null);
    const migres = new Set((migr ?? []).map((m) => m.ancien_id as string));
    for (const a of filtrerAnciens(anciens, anciensSegments, disciplines, saisonRef)) {
      if (migres.has(a.id)) continue;
      if (!a.email || !a.email.trim()) {
        exclusSansEmail++; // conservé en base, juste non joignable par mail
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

  // Vrais doublons fusionnés (même personne captée plusieurs fois).
  const doublons = totalAvant - personnes.size;

  // Exclusion RGPD au niveau EMAIL (si l'email est désinscrit, tout le groupe).
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
    return NextResponse.json(
      {
        error: "Aucun destinataire (liste vide ou tous désinscrits).",
        exclus: personnesExclues,
      },
      { status: 400 },
    );
  }

  // Personnes réellement ciblées (décompte "X touchés via Y emails").
  const personnesCiblees = envois.reduce((s, e) => s + e.personnes.length, 0);

  // Envoi : 1 email par groupe, par lots de 50.
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

  // Sauvegarde de la campagne.
  // Liste réelle des destinataires, FIGÉE à l'envoi, GROUPÉE par email
  // (familles préservées). Jamais recalculée après coup.
  const destinatairesListe = envois.map((e) => ({
    email: e.email,
    personnes: e.personnes.map((p) => ({
      prenom: p.prenom ?? null,
      nom: p.nom ?? null,
    })),
  }));
  // Résumé lisible de la cible (segments/listes), pour l'historique unifié.
  const cibleParts: string[] = [];
  for (const k of smartLists) {
    cibleParts.push(SMART_LISTS.find((s) => s.key === k)?.label ?? k);
  }
  for (const s of anciensSegments) {
    cibleParts.push(SEGMENTS_ANCIENS.find((x) => x.key === s)?.label ?? s);
  }
  if (disciplines.length > 0) {
    cibleParts.push(
      disciplines.map((d) => DISCIPLINES.find((x) => x.key === d)?.label ?? d).join(" / "),
    );
  }
  if (body.includeContacts) cibleParts.push("Contacts importés");
  if (manualEmails.length > 0) {
    cibleParts.push(`${manualEmails.length} email(s) manuel(s)`);
  }
  const cible = cibleParts.join(" · ") || "Personnalisé";

  const insertPayload: Record<string, unknown> = {
    titre: (body.titre || objet).slice(0, 200),
    objet,
    contenu,
    type: "campagne",
    cible,
    liste_type: "mixte",
    liste_filtre: {
      smartLists,
      anciensSegments,
      disciplines,
      includeContacts: !!body.includeContacts,
      manualEmails: manualEmails.length,
    },
    nb_destinataires: personnesCiblees, // personnes touchées
    nb_envoyes: emailsEnvoyes, // emails réellement envoyés
    nb_exclus: personnesExclues + exclusSansEmail,
    statut: emailsEnvoyes > 0 ? "envoye" : "erreur",
    envoye_at: new Date().toISOString(),
    destinataires_liste: destinatairesListe,
  };
  // Tolérance : si une colonne ajoutée par la migration n'existe pas encore,
  // on la retire et on réinsère, pour ne jamais bloquer l'envoi.
  const colonnesOptionnelles = [
    "destinataires_liste",
    "type",
    "cible",
    "nb_envoyes",
    "nb_exclus",
  ];
  let insErr: { message: string } | null = null;
  for (;;) {
    ({ error: insErr } = await supabase.from("campagnes").insert(insertPayload));
    if (!insErr) break;
    const offending = colonnesOptionnelles.find((k) => insErr!.message.includes(k));
    if (!offending) break;
    delete insertPayload[offending];
  }
  if (insErr) console.error("Insert campagne:", insErr);

  return NextResponse.json({
    success: emailsEnvoyes > 0,
    emails: emailsEnvoyes, // nb d'emails envoyés
    personnes: personnesCiblees, // nb de personnes touchées
    doublons, // vrais doublons (même personne) fusionnés
    exclus: personnesExclues, // désinscrits (personnes)
    exclusSansEmail,
  });
}
