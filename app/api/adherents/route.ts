import { NextResponse } from "next/server";
import { getSupabaseAdmin, isSupabaseConfigured } from "@/lib/supabase";
import {
  buildAdherentInsert,
  validatePayload,
  type InscriptionPayload,
} from "@/lib/inscription";
import { sendAdherentConfirmation, sendAdminNotification } from "@/lib/email";

export const runtime = "nodejs";

// POST — création d'un adhérent (utilisé pour le paiement en espèces).
export async function POST(request: Request) {
  if (!isSupabaseConfigured()) {
    return NextResponse.json(
      { error: "Supabase non configuré sur le serveur." },
      { status: 503 },
    );
  }

  let payload: InscriptionPayload;
  try {
    payload = (await request.json()) as InscriptionPayload;
  } catch {
    return NextResponse.json({ error: "Corps de requête invalide." }, { status: 400 });
  }

  const err = validatePayload(payload);
  if (err) return NextResponse.json({ error: err }, { status: 400 });

  // Espèces → en_attente ; paiement carte traité via create-payment-intent.
  const record = buildAdherentInsert(payload, "en_attente");

  const supabase = getSupabaseAdmin();
  let { data, error } = await supabase
    .from("adherents")
    .insert(record)
    .select()
    .single();

  // Tolérance : si la migration documents_valides n'a pas encore été appliquée,
  // on réessaie sans ce champ (la colonne prendra son DEFAULT une fois créée).
  if (error && /documents_valides/.test(error.message)) {
    const rest = { ...record };
    delete (rest as Record<string, unknown>).documents_valides;
    ({ data, error } = await supabase
      .from("adherents")
      .insert(rest)
      .select()
      .single());
  }

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // Emails (best-effort, n'interrompent pas la réponse).
  try {
    await Promise.all([
      sendAdherentConfirmation({ ...record, adherentId: data.id }),
      sendAdminNotification({ ...record, adherentId: data.id }),
    ]);
  } catch (e) {
    console.error("Email error:", e);
  }

  return NextResponse.json({ adherent: data }, { status: 201 });
}

// GET — liste des adhérents (dashboard admin).
export async function GET(request: Request) {
  if (!isSupabaseConfigured()) {
    return NextResponse.json({ adherents: [] });
  }
  const { searchParams } = new URL(request.url);
  const saison = searchParams.get("saison");

  const supabase = getSupabaseAdmin();
  let query = supabase
    .from("adherents")
    .select("*")
    .order("created_at", { ascending: false });

  if (saison) query = query.eq("saison", saison);

  const { data, error } = await query;
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ adherents: data ?? [] });
}
