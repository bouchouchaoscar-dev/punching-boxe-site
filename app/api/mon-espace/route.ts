import { NextResponse } from "next/server";
import {
  getSupabaseAdmin,
  isSupabaseConfigured,
  STORAGE_BUCKET,
} from "@/lib/supabase";
import { sendAdminDocReplaced } from "@/lib/email";
import { evaluerDossier } from "@/lib/dossier";

export const runtime = "nodejs";

const FIELDS = [
  "fiche_inscription",
  "certificat_medical",
  "reglement",
  "photo",
] as const;
type Field = (typeof FIELDS)[number];

const URL_COLUMN: Record<Field, string> = {
  fiche_inscription: "fiche_inscription_url",
  certificat_medical: "certificat_medical_url",
  reglement: "reglement_url",
  photo: "photo_url",
};

// Base des colonnes de validation par document.
const DOC_BASE: Record<Field, string> = {
  fiche_inscription: "fiche",
  certificat_medical: "certificat",
  reglement: "reglement",
  photo: "photo",
};
const DOC_LABEL: Record<Field, string> = {
  fiche_inscription: "Fiche d'inscription",
  certificat_medical: "Certificat médical",
  reglement: "Règlement intérieur",
  photo: "Photo d'identité",
};

const MAX_SIZE = 5 * 1024 * 1024; // 5 Mo

/** Vérifie le JWT Supabase Auth et renvoie l'email de l'utilisateur connecté. */
async function getUserEmail(request: Request): Promise<string | null> {
  const auth = request.headers.get("authorization") || "";
  const token = auth.replace(/^Bearer\s+/i, "").trim();
  if (!token) return null;
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase.auth.getUser(token);
  if (error || !data.user?.email) return null;
  return data.user.email;
}

// GET — dossier de l'adhérent connecté (rattaché par email).
export async function GET(request: Request) {
  if (!isSupabaseConfigured()) {
    return NextResponse.json({ error: "Supabase non configuré." }, { status: 503 });
  }
  const email = await getUserEmail(request);
  if (!email) {
    return NextResponse.json({ error: "Non authentifié." }, { status: 401 });
  }

  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from("adherents")
    .select("*")
    .ilike("email", email)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ adherent: data });
}

// POST — dépôt / remplacement d'un document par l'adhérent connecté.
export async function POST(request: Request) {
  if (!isSupabaseConfigured()) {
    return NextResponse.json({ error: "Supabase non configuré." }, { status: 503 });
  }
  const email = await getUserEmail(request);
  if (!email) {
    return NextResponse.json({ error: "Non authentifié." }, { status: 401 });
  }

  const supabase = getSupabaseAdmin();
  const { data: adherent, error: findErr } = await supabase
    .from("adherents")
    .select("id, prenom, nom")
    .ilike("email", email)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (findErr || !adherent) {
    return NextResponse.json(
      { error: "Aucun dossier d'inscription rattaché à votre compte." },
      { status: 404 },
    );
  }

  const form = await request.formData();
  const file = form.get("file");
  const field = String(form.get("field") || "") as Field;

  if (!(file instanceof File)) {
    return NextResponse.json({ error: "Fichier manquant." }, { status: 400 });
  }
  if (!FIELDS.includes(field)) {
    return NextResponse.json({ error: "Document invalide." }, { status: 400 });
  }
  if (file.size > MAX_SIZE) {
    return NextResponse.json(
      { error: "Fichier trop volumineux (max 5 Mo)." },
      { status: 413 },
    );
  }

  const isImage = field === "photo";
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
  const path = `${adherent.id}/${field}.${ext}`;
  const buffer = Buffer.from(await file.arrayBuffer());

  const { error: upErr } = await supabase.storage
    .from(STORAGE_BUCKET)
    .upload(path, buffer, { contentType: file.type, upsert: true });
  if (upErr) {
    return NextResponse.json({ error: upErr.message }, { status: 500 });
  }

  const { data: pub } = supabase.storage.from(STORAGE_BUCKET).getPublicUrl(path);

  // On enregistre l'URL et on réinitialise la validation de CE document : le
  // doc redéposé n'est plus validé et son éventuel refus est levé (à revoir).
  const base = DOC_BASE[field];
  const update: Record<string, unknown> = {
    [URL_COLUMN[field]]: pub.publicUrl,
    [`${base}_valide`]: false,
    [`${base}_motif_refus`]: null,
  };
  let { data: updated, error: updErr } = await supabase
    .from("adherents")
    .update(update)
    .eq("id", adherent.id)
    .select()
    .single();
  // Tolérance : colonnes de validation non encore migrées → au moins l'URL.
  if (updErr && /(_valide|_motif_refus)/.test(updErr.message)) {
    ({ data: updated, error: updErr } = await supabase
      .from("adherents")
      .update({ [URL_COLUMN[field]]: pub.publicUrl })
      .eq("id", adherent.id)
      .select()
      .single());
  }
  if (updErr) {
    return NextResponse.json({ error: updErr.message }, { status: 500 });
  }

  // documents_valides DÉRIVÉ : vrai uniquement si les 4 documents sont validés
  // (fiche + règlement + photo + certificat médical).
  if (updated) {
    const derived = evaluerDossier(updated).documentsValides;
    if (updated.documents_valides !== derived) {
      await supabase
        .from("adherents")
        .update({ documents_valides: derived })
        .eq("id", adherent.id);
    }
  }

  // Notifie Pascal qu'un document a été (re)déposé et attend validation.
  try {
    await sendAdminDocReplaced({
      prenom: adherent.prenom,
      nom: adherent.nom,
      adherentId: adherent.id,
      docLabel: DOC_LABEL[field],
    });
  } catch (e) {
    console.error("Email admin doc déposé:", e);
  }

  return NextResponse.json({ url: pub.publicUrl, field });
}
