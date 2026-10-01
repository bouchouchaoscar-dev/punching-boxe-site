import { NextResponse } from "next/server";
import {
  getSupabaseAdmin,
  isSupabaseConfigured,
  STORAGE_BUCKET,
} from "@/lib/supabase";
import {
  CHAMPS_PIECE,
  TYPE_META,
  validerPiece,
  type ChampPiece,
  type TypePiece,
} from "@/lib/upload-piece";

export const runtime = "nodejs";

const FIELDS = CHAMPS_PIECE;
type Field = ChampPiece;

// Colonne `_url` correspondant à chaque document (pour la persistance admin).
const URL_COLUMN: Record<Field, string> = {
  fiche_inscription: "fiche_inscription_url",
  certificat_medical: "certificat_medical_url",
  reglement: "reglement_url",
  photo: "photo_url",
};

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

  // VALIDATION PAR CONTENU RÉEL (magic bytes, source unique) — file.type ignoré.
  const v = validerPiece(field, buffer);
  if (!v.ok) {
    return NextResponse.json({ error: v.error }, { status: v.status });
  }
  const detected: TypePiece = v.type;

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
  const autresChemins = (Object.keys(TYPE_META) as TypePiece[])
    .filter((t) => t !== detected)
    .map((t) => `${adherentId}/${field}.${TYPE_META[t].ext}`);
  if (autresChemins.length) {
    const { error: rmErr } = await supabase.storage
      .from(STORAGE_BUCKET)
      .remove(autresChemins);
    if (rmErr) console.error("Nettoyage variantes (ignoré):", rmErr.message);
  }

  // Bucket privé cible : on stocke le CHEMIN storage (pas d'URL publique). La
  // lecture signe à la volée (helper). Rétrocompatible (le helper lit aussi les
  // anciennes URLs publiques déjà en base).
  // Persistance admin : on enregistre le chemin sur la ligne de l'adhérent et on
  // ré-invalide la validation des documents (un nouveau document doit être revu).
  if (persist) {
    const update: Record<string, unknown> = {
      [URL_COLUMN[field]]: path,
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
        .update({ [URL_COLUMN[field]]: path })
        .eq("id", adherentId));
    }
    if (upErr) {
      return NextResponse.json({ error: upErr.message }, { status: 500 });
    }
  }

  return NextResponse.json({ url: path, path, field, type: detected });
}
