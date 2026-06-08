import { NextResponse } from "next/server";
import { getSupabaseAdmin, isSupabaseConfigured } from "@/lib/supabase";
import {
  buildAdherentInsert,
  validatePayload,
  OPTIONAL_DOC_COLUMNS,
  type InscriptionPayload,
} from "@/lib/inscription";
import { sendAdherentConfirmation, sendAdminNotification } from "@/lib/email";
import { getAuthUser } from "@/lib/auth-server";

export const runtime = "nodejs";

// POST — création d'un adhérent (utilisé pour le paiement en espèces).
export async function POST(request: Request) {
  if (!isSupabaseConfigured()) {
    return NextResponse.json(
      { error: "Supabase non configuré sur le serveur." },
      { status: 503 },
    );
  }

  // Le dossier est rattaché au compte connecté (titulaire). Pas de session
  // valide → pas de dossier orphelin.
  const user = await getAuthUser(request);
  if (!user) {
    return NextResponse.json(
      { error: "Connexion requise pour vous inscrire." },
      { status: 401 },
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

  const supabase = getSupabaseAdmin();

  // Remise famille AUTOMATIQUE : le rang = nombre de dossiers déjà rattachés
  // au titulaire (tous statuts, tous liens) + lui-même. On ignore toute valeur
  // nb_membres_famille envoyée par le client. Comptage en échec → 0 (sûr).
  const { count: nbFoyer, error: cntErr } = await supabase
    .from("adherents")
    .select("id", { count: "exact", head: true })
    .eq("titulaire_id", user.id);
  const payloadAuto = {
    ...payload,
    nb_membres_famille: cntErr ? 0 : nbFoyer ?? 0,
  };

  // Espèces → en_attente ; paiement carte traité via create-payment-intent.
  // titulaire_id = user.id (jamais une valeur fournie par le client).
  const record = buildAdherentInsert(payloadAuto, "en_attente", user.id);

  let { data, error } = await supabase
    .from("adherents")
    .insert(record)
    .select()
    .single();

  // Tolérance : si les migrations de validation des documents ne sont pas encore
  // appliquées, on réessaie sans ces colonnes (DEFAULT pris à la création).
  if (error && OPTIONAL_DOC_COLUMNS.some((c) => error!.message.includes(c))) {
    const rest = { ...record } as Record<string, unknown>;
    for (const c of OPTIONAL_DOC_COLUMNS) delete rest[c];
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
