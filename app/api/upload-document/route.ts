import { NextResponse } from "next/server";
import {
  getSupabaseAdmin,
  isSupabaseConfigured,
  STORAGE_BUCKET,
} from "@/lib/supabase";

export const runtime = "nodejs";

const FIELDS = [
  "fiche_inscription",
  "certificat_medical",
  "reglement",
  "photo",
] as const;
type Field = (typeof FIELDS)[number];

// Colonne `_url` correspondant à chaque document (pour la persistance admin).
const URL_COLUMN: Record<Field, string> = {
  fiche_inscription: "fiche_inscription_url",
  certificat_medical: "certificat_medical_url",
  reglement: "reglement_url",
  photo: "photo_url",
};

const MAX_PDF = 5 * 1024 * 1024; // 5 Mo
const MAX_IMG = 5 * 1024 * 1024; // 5 Mo

export async function POST(request: Request) {
  if (!isSupabaseConfigured()) {
    return NextResponse.json(
      { error: "Stockage non configuré (Supabase)." },
      { status: 503 },
    );
  }

  const form = await request.formData();
  const file = form.get("file");
  const adherentId = String(form.get("adherentId") || "");
  const field = String(form.get("field") || "") as Field;
  const persist = String(form.get("persist") || "") === "1";

  if (!(file instanceof File)) {
    return NextResponse.json({ error: "Fichier manquant." }, { status: 400 });
  }
  if (!adherentId || !/^[a-zA-Z0-9-]+$/.test(adherentId)) {
    return NextResponse.json({ error: "Identifiant invalide." }, { status: 400 });
  }
  if (!FIELDS.includes(field)) {
    return NextResponse.json({ error: "Champ invalide." }, { status: 400 });
  }

  const isImage = field === "photo";
  const max = isImage ? MAX_IMG : MAX_PDF;
  if (file.size > max) {
    return NextResponse.json(
      { error: "Fichier trop volumineux (max 5 Mo)." },
      { status: 413 },
    );
  }

  const okType = isImage
    ? ["image/jpeg", "image/png"].includes(file.type)
    : file.type === "application/pdf";
  if (!okType) {
    return NextResponse.json(
      { error: isImage ? "Image JPG ou PNG attendue." : "PDF attendu." },
      { status: 415 },
    );
  }

  const ext = isImage ? (file.type === "image/png" ? "png" : "jpg") : "pdf";
  const path = `${adherentId}/${field}.${ext}`;
  const buffer = Buffer.from(await file.arrayBuffer());

  const supabase = getSupabaseAdmin();
  const { error } = await supabase.storage
    .from(STORAGE_BUCKET)
    .upload(path, buffer, { contentType: file.type, upsert: true });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const { data } = supabase.storage.from(STORAGE_BUCKET).getPublicUrl(path);
  const publicUrl = data.publicUrl;

  // Persistance admin : on enregistre l'URL sur la ligne de l'adhérent et on
  // ré-invalide la validation des documents (un nouveau document doit être revu).
  if (persist) {
    const update: Record<string, unknown> = {
      [URL_COLUMN[field]]: publicUrl,
      documents_valides: false,
    };
    let { error: upErr } = await supabase
      .from("adherents")
      .update(update)
      .eq("id", adherentId);
    // Tolérance : si la colonne documents_valides n'existe pas encore,
    // on réessaie sans elle pour ne pas bloquer le remplacement.
    if (upErr && /documents_valides/.test(upErr.message)) {
      ({ error: upErr } = await supabase
        .from("adherents")
        .update({ [URL_COLUMN[field]]: publicUrl })
        .eq("id", adherentId));
    }
    if (upErr) {
      return NextResponse.json({ error: upErr.message }, { status: 500 });
    }
  }

  return NextResponse.json({ url: publicUrl, path, field });
}
