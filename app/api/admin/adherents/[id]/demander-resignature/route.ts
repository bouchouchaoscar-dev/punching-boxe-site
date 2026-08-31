import { NextResponse } from "next/server";
import { getSupabaseAdmin, isSupabaseConfigured } from "@/lib/supabase";
import { isAdminRequest } from "@/lib/admin-guard";
import { buildResignatureUrl, type ResignDoc } from "@/lib/resignature-link";
import { sendDemandeResignature } from "@/lib/email";

export const runtime = "nodejs";

type Ctx = { params: Promise<{ id: string }> };

// POST — demande une re-signature (admin) : passe le(s) document(s) en
// « à re-signer », génère un lien HMAC scopé + expirable, et envoie un mail au
// compte titulaire. NE régénère PAS les PDF (lot 4) et NE crée PAS la page
// /re-signer (lot 3). Serveur autoritaire (id, existence, docs, secret).
export async function POST(request: Request, { params }: Ctx) {
  const { id } = await params;
  if (!isAdminRequest(request)) {
    return NextResponse.json({ error: "Non autorisé." }, { status: 401 });
  }
  if (!isSupabaseConfigured()) {
    return NextResponse.json({ error: "Supabase non configuré." }, { status: 503 });
  }

  let body: { docs?: string[] };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Corps invalide." }, { status: 400 });
  }
  const docs = (body.docs ?? []).filter(
    (d): d is ResignDoc => d === "fiche" || d === "reglement",
  );
  if (docs.length === 0) {
    return NextResponse.json(
      { error: "Sélectionnez au moins un document (fiche et/ou règlement)." },
      { status: 400 },
    );
  }

  const supabase = getSupabaseAdmin();
  const { data: adherent } = await supabase
    .from("adherents")
    .select("id, prenom, email")
    .eq("id", id)
    .maybeSingle();
  if (!adherent) {
    return NextResponse.json({ error: "Dossier introuvable." }, { status: 404 });
  }
  if (!adherent.email) {
    return NextResponse.json(
      { error: "Aucun email sur ce dossier : impossible d'envoyer la demande." },
      { status: 422 },
    );
  }

  // Génère le lien AVANT toute écriture : si RESIGN_SECRET est absent, on échoue
  // proprement (fail-closed) sans avoir flaggé le dossier.
  let lien: string;
  try {
    lien = buildResignatureUrl(id, docs);
  } catch {
    return NextResponse.json(
      {
        error:
          "Re-signature non configurée (RESIGN_SECRET manquant côté serveur).",
      },
      { status: 503 },
    );
  }

  // Passe le(s) doc(s) en « à re-signer » + trace de la demande.
  const update: Record<string, unknown> = {
    resignature_demandee_at: new Date().toISOString(),
  };
  if (docs.includes("fiche")) update.fiche_a_resigner = true;
  if (docs.includes("reglement")) update.reglement_a_resigner = true;
  const { error: upErr } = await supabase
    .from("adherents")
    .update(update)
    .eq("id", id);
  if (upErr) {
    return NextResponse.json({ error: upErr.message }, { status: 500 });
  }

  // Mail au titulaire. Un échec d'envoi n'annule pas la demande (flags posés) :
  // on le remonte au front pour affichage.
  try {
    await sendDemandeResignature({
      prenom: adherent.prenom ?? "",
      email: adherent.email,
      docs,
      lien,
    });
  } catch (e) {
    console.error("Mail re-signature:", e);
    return NextResponse.json({
      success: true,
      mailEnvoye: false,
      error: "Demande enregistrée, mais l'email n'a pas pu être envoyé.",
    });
  }

  return NextResponse.json({ success: true, mailEnvoye: true });
}
