import { NextResponse } from "next/server";
import { getSupabaseAdmin, isSupabaseConfigured } from "@/lib/supabase";
import { isAdminRequest } from "@/lib/admin-guard";
import { getResendClient, MAIL_FROM, renderCampagne } from "@/lib/email";
import {
  remplacerVariables,
  formuleLabel,
  disciplinesLabel,
  type DestinataireVars,
} from "@/lib/campagnes";
import { saisonCourante } from "@/lib/saison";
import type { Adherent } from "@/lib/types";

export const runtime = "nodejs";

// Colonnes ajoutées par la migration "historique unifié". On les retire de
// l'insert si elles n'existent pas encore (dégradation gracieuse).
const COLONNES_OPTIONNELLES = [
  "destinataires_liste",
  "type",
  "cible",
  "nb_envoyes",
  "nb_exclus",
];

export async function POST(request: Request) {
  if (!isAdminRequest(request)) {
    return NextResponse.json({ error: "Non autorisé." }, { status: 401 });
  }
  if (!isSupabaseConfigured()) {
    return NextResponse.json({ error: "Supabase non configuré." }, { status: 503 });
  }

  let body: {
    type?: "natif" | "ancien";
    id?: string;
    objet?: string;
    contenu?: string;
  };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Corps invalide." }, { status: 400 });
  }

  const type = body.type;
  const id = (body.id || "").trim();
  const objet = (body.objet || "").trim();
  const contenu = (body.contenu || "").trim();
  if (type !== "natif" && type !== "ancien") {
    return NextResponse.json({ error: "Type invalide." }, { status: 400 });
  }
  if (!id || !objet || !contenu) {
    return NextResponse.json(
      { error: "Destinataire, objet et contenu requis." },
      { status: 400 },
    );
  }

  const resend = getResendClient();
  if (!resend) {
    return NextResponse.json(
      { error: "Envoi impossible : RESEND_API_KEY non configuré." },
      { status: 503 },
    );
  }

  const supabase = getSupabaseAdmin();
  const saisonRef = saisonCourante(new Date());

  // Variables remplies CÔTÉ SERVEUR (source de vérité) selon la nature du dossier.
  let vars: DestinataireVars;
  let email = "";
  let prenom = "";
  let nom = "";

  if (type === "natif") {
    const { data } = await supabase
      .from("adherents")
      .select("*")
      .eq("id", id)
      .maybeSingle();
    if (!data) {
      return NextResponse.json({ error: "Adhérent introuvable." }, { status: 404 });
    }
    const a = data as Adherent;
    email = (a.email || "").trim();
    prenom = a.prenom;
    nom = a.nom;
    vars = {
      prenom: a.prenom,
      nom: a.nom,
      formule: formuleLabel(a.package),
      montant: a.montant_total,
      saison: a.saison || saisonRef,
      derniere_saison: "",
      disciplines: formuleLabel(a.package),
    };
  } else {
    const { data } = await supabase
      .from("anciens_recence")
      .select("id, nom, prenom, email, derniere_saison, disciplines")
      .eq("id", id)
      .maybeSingle();
    if (!data) {
      return NextResponse.json({ error: "Ancien introuvable." }, { status: 404 });
    }
    email = (data.email || "").trim();
    prenom = data.prenom ?? "";
    nom = data.nom ?? "";
    vars = {
      prenom: data.prenom,
      nom: data.nom,
      saison: saisonRef,
      derniere_saison: data.derniere_saison ?? "",
      disciplines: disciplinesLabel(data.disciplines),
      formule: disciplinesLabel(data.disciplines),
    };
  }

  if (!email) {
    return NextResponse.json(
      { error: "Cette personne n'a pas d'adresse email." },
      { status: 400 },
    );
  }

  // Traçage RGPD : on note si la personne est désinscrite (envoi non bloqué,
  // décision admin assumée), pour transparence dans l'historique.
  const { data: optout } = await supabase
    .from("desinscriptions_mailing")
    .select("email")
    .eq("email", email.toLowerCase())
    .maybeSingle();
  const desinscrit = !!optout;

  // Envoi unitaire (même pipeline que les campagnes : variables → gabarit + CTA
  // + pied de désinscription RGPD).
  const { error: sendErr } = await resend.emails.send({
    from: MAIL_FROM,
    to: email,
    subject: remplacerVariables(objet, vars),
    html: renderCampagne(remplacerVariables(contenu, vars), email),
  });
  const sent = sendErr ? 0 : 1;
  if (sendErr) console.error("Resend send-individuel:", sendErr);

  // Enregistrement dans l'historique unifié (table campagnes, type='individuel').
  const cible = `${prenom} ${nom}`.trim() || email;
  const payload: Record<string, unknown> = {
    titre: objet.slice(0, 200),
    objet,
    contenu,
    type: "individuel",
    cible,
    liste_type: "individuel",
    liste_filtre: { type, id, desinscrit },
    nb_destinataires: 1,
    nb_envoyes: sent,
    nb_exclus: 0,
    statut: sent > 0 ? "envoye" : "erreur",
    envoye_at: new Date().toISOString(),
    destinataires_liste: [{ nom, prenom, email }],
  };
  // Insert tolérant aux colonnes manquantes (migration non appliquée).
  let insErr: { message: string } | null = null;
  for (;;) {
    ({ error: insErr } = await supabase.from("campagnes").insert(payload));
    if (!insErr) break;
    const offending = COLONNES_OPTIONNELLES.find((k) =>
      insErr!.message.includes(k),
    );
    if (!offending) break;
    delete payload[offending];
  }
  if (insErr) console.error("Insert campagne (individuel):", insErr);

  return NextResponse.json({ success: sent > 0, sent, desinscrit });
}
