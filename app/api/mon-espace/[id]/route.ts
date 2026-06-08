import { NextResponse } from "next/server";
import {
  getSupabaseAdmin,
  isSupabaseConfigured,
  STORAGE_BUCKET,
} from "@/lib/supabase";
import { getAuthUser } from "@/lib/auth-server";
import { estEngage } from "@/lib/engagement";
import type { Adherent } from "@/lib/types";

export const runtime = "nodejs";

type Ctx = { params: Promise<{ id: string }> };

// DELETE — suppression d'un dossier NON payé par son titulaire (self-service).
// Vérifie l'appartenance ET l'absence de paiement validé côté serveur.
export async function DELETE(request: Request, { params }: Ctx) {
  if (!isSupabaseConfigured()) {
    return NextResponse.json({ error: "Supabase non configuré." }, { status: 503 });
  }
  const { id } = await params;
  const user = await getAuthUser(request);
  if (!user) {
    return NextResponse.json({ error: "Non authentifié." }, { status: 401 });
  }

  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from("adherents")
    .select("*")
    .eq("id", id)
    .maybeSingle();
  if (error || !data) {
    return NextResponse.json({ error: "Dossier introuvable." }, { status: 404 });
  }
  const adherent = data as Adherent;

  // Sécurité : appartenance.
  if (adherent.titulaire_id !== user.id) {
    return NextResponse.json(
      { error: "Ce dossier n'appartient pas à votre compte." },
      { status: 403 },
    );
  }
  // Sécurité : on ne supprime QUE tant qu'aucun paiement n'est validé.
  if (estEngage(adherent)) {
    return NextResponse.json(
      { error: "Ce dossier a un paiement validé et ne peut plus être supprimé." },
      { status: 409 },
    );
  }

  // 1) Fichiers Storage sous "<id>/" (fiche, certificat, règlement, photo…).
  try {
    const { data: files } = await supabase.storage
      .from(STORAGE_BUCKET)
      .list(id);
    if (files && files.length > 0) {
      await supabase.storage
        .from(STORAGE_BUCKET)
        .remove(files.map((f) => `${id}/${f.name}`));
    }
  } catch (e) {
    console.error("Suppression Storage:", e);
    // best-effort : on continue la suppression DB même si le Storage échoue.
  }

  // 2) Paiements liés (tous en_attente/echec — aucun payé puisque non engagé).
  await supabase.from("paiements").delete().eq("adherent_id", id);

  // 3) Le dossier lui-même.
  const { error: delErr } = await supabase.from("adherents").delete().eq("id", id);
  if (delErr) {
    return NextResponse.json({ error: delErr.message }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}
