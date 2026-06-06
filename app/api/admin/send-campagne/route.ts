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
  remplacerVariables,
  formuleLabel,
  type SmartListKey,
  type DestinataireVars,
} from "@/lib/campagnes";
import type { Adherent } from "@/lib/types";

export const runtime = "nodejs";

type Recipient = { email: string } & DestinataireVars;

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

  // Index email → variables (dédup, insensible à la casse).
  const map = new Map<string, Recipient>();
  let totalAvant = 0;
  const add = (r: Recipient) => {
    const key = r.email.trim().toLowerCase();
    if (!key) return;
    totalAvant++;
    if (!map.has(key)) map.set(key, { ...r, email: key });
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
  const adherentVars = (a: Adherent): Recipient => ({
    email: a.email,
    prenom: a.prenom,
    nom: a.nom,
    formule: formuleLabel(a.package),
    montant: a.montant_total,
  });

  if (smartLists.length > 0) {
    for (const a of filtrerAdherents(adherents, smartLists)) add(adherentVars(a));
  }

  // 2) Sélection manuelle (emails d'adhérents).
  if (manualEmails.length > 0) {
    const byEmail = new Map(adherents.map((a) => [a.email.toLowerCase(), a]));
    for (const e of manualEmails) {
      const a = byEmail.get(e);
      if (a) add(adherentVars(a));
      else add({ email: e });
    }
  }

  // 3) Contacts importés.
  if (body.includeContacts) {
    const { data } = await supabase
      .from("contacts_mailing")
      .select("email, prenom, nom");
    for (const c of data ?? []) {
      add({ email: c.email, prenom: c.prenom, nom: c.nom });
    }
  }

  const recipients = [...map.values()];
  if (recipients.length === 0) {
    return NextResponse.json({ error: "Aucun destinataire." }, { status: 400 });
  }

  // Envoi par lots de 50.
  let sent = 0;
  for (const lot of chunk(recipients, 50)) {
    const emails = lot.map((r) => ({
      from: MAIL_FROM,
      to: r.email,
      subject: remplacerVariables(objet, r),
      html: renderCampagne(remplacerVariables(contenu, r)),
    }));
    const { error } = await resend.batch.send(emails);
    if (!error) sent += lot.length;
    else console.error("Resend batch error:", error);
  }

  // Sauvegarde de la campagne.
  const doublons = totalAvant - recipients.length;
  // Liste réelle des destinataires (pour la page détail / réutilisation).
  const destinatairesListe = recipients.map((r) => ({
    nom: r.nom ?? null,
    prenom: r.prenom ?? null,
    email: r.email,
  }));
  const insertPayload = {
    titre: (body.titre || objet).slice(0, 200),
    objet,
    contenu,
    liste_type: "mixte",
    liste_filtre: {
      smartLists,
      includeContacts: !!body.includeContacts,
      manualEmails: manualEmails.length,
    },
    nb_destinataires: recipients.length,
    statut: sent > 0 ? "envoye" : "erreur",
    envoye_at: new Date().toISOString(),
    destinataires_liste: destinatairesListe,
  };
  // Tolérance : si la colonne destinataires_liste n'existe pas encore (migration
  // non appliquée), on réinsère sans elle pour ne pas bloquer l'envoi.
  let { error: insErr } = await supabase.from("campagnes").insert(insertPayload);
  if (insErr && /destinataires_liste/.test(insErr.message)) {
    const { destinataires_liste: _omit, ...sansListe } = insertPayload;
    void _omit;
    ({ error: insErr } = await supabase.from("campagnes").insert(sansListe));
  }
  if (insErr) console.error("Insert campagne:", insErr);

  return NextResponse.json({ success: sent > 0, sent, doublons });
}
