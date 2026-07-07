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

// ─────────────────────────────────────────────────────────────────────────
// Politique d'upload — validée par MAGIC BYTES (contenu réel), JAMAIS par
// file.type (le client peut mentir : c'est ce qui a produit un JPEG stocké en
// .pdf, illisible). Tout est déclaré ici, rien en dur plus bas.
// ─────────────────────────────────────────────────────────────────────────
const MAX_UPLOAD = 5 * 1024 * 1024; // 5 Mo — tous documents

type DetectedType = "pdf" | "jpg" | "png";

// Types réellement acceptés par champ (déduits du CONTENU) :
// - fiche & règlement : PDF strict (générés par React-PDF => toujours de vrais PDF)
// - certificat médical : PDF, JPG ou PNG (le papier est souvent photographié)
// - photo d'identité : image JPG ou PNG
const ACCEPTS: Record<Field, DetectedType[]> = {
  fiche_inscription: ["pdf"],
  reglement: ["pdf"],
  certificat_medical: ["pdf", "jpg", "png"],
  photo: ["jpg", "png"],
};

// Extension + Content-Type imposés par le type SNIFFÉ (source de vérité unique).
const TYPE_META: Record<DetectedType, { ext: string; contentType: string }> = {
  pdf: { ext: "pdf", contentType: "application/pdf" },
  jpg: { ext: "jpg", contentType: "image/jpeg" },
  png: { ext: "png", contentType: "image/png" },
};

// Détection par signature binaire. Côté serveur uniquement.
function sniffType(buf: Buffer): DetectedType | null {
  if (
    buf.length >= 5 &&
    buf[0] === 0x25 && buf[1] === 0x50 && buf[2] === 0x44 &&
    buf[3] === 0x46 && buf[4] === 0x2d
  ) return "pdf"; // "%PDF-"
  if (buf.length >= 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff)
    return "jpg"; // JPEG : FF D8 FF
  if (
    buf.length >= 8 &&
    buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47 &&
    buf[4] === 0x0d && buf[5] === 0x0a && buf[6] === 0x1a && buf[7] === 0x0a
  ) return "png"; // PNG : 89 50 4E 47 0D 0A 1A 0A
  return null;
}

// Message de rejet clair (français) selon ce que le champ accepte vraiment.
function messageRefus(field: Field): string {
  const a = ACCEPTS[field];
  if (a.length === 1 && a[0] === "pdf") return "Un fichier PDF est attendu.";
  if (field === "photo") return "Une image JPG ou PNG est attendue.";
  return "Fichier non reconnu : un PDF, une image JPG ou PNG est attendu.";
}

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

  const buffer = Buffer.from(await file.arrayBuffer());
  if (buffer.length === 0) {
    return NextResponse.json({ error: "Fichier vide." }, { status: 400 });
  }
  if (buffer.length > MAX_UPLOAD) {
    return NextResponse.json(
      { error: "Fichier trop volumineux (max 5 Mo)." },
      { status: 413 },
    );
  }

  // VALIDATION PAR CONTENU RÉEL (magic bytes) — file.type est ignoré.
  const detected = sniffType(buffer);
  if (!detected || !ACCEPTS[field].includes(detected)) {
    return NextResponse.json({ error: messageRefus(field) }, { status: 415 });
  }

  // Extension + Content-Type imposés par le type sniffé (jamais file.type/nom).
  const { ext, contentType } = TYPE_META[detected];
  const path = `${adherentId}/${field}.${ext}`;

  const supabase = getSupabaseAdmin();
  const { error } = await supabase.storage
    .from(STORAGE_BUCKET)
    .upload(path, buffer, { contentType, upsert: true });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // Nettoyage best-effort : retire les variantes d'AUTRE extension du même champ
  // (ex. un ancien certificat_medical.pdf quand on ré-uploade en .jpg), pour ne
  // jamais laisser une pièce d'un type qui ne correspond plus à l'URL enregistrée.
  const autresChemins = (Object.keys(TYPE_META) as DetectedType[])
    .filter((t) => t !== detected)
    .map((t) => `${adherentId}/${field}.${TYPE_META[t].ext}`);
  if (autresChemins.length) {
    const { error: rmErr } = await supabase.storage
      .from(STORAGE_BUCKET)
      .remove(autresChemins);
    if (rmErr) console.error("Nettoyage variantes (ignoré):", rmErr.message);
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

  return NextResponse.json({ url: publicUrl, path, field, type: detected });
}
