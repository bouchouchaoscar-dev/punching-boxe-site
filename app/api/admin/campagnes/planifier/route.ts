import { NextResponse } from "next/server";
import { getSupabaseAdmin, isSupabaseConfigured } from "@/lib/supabase";
import { isAdminRequest } from "@/lib/admin-guard";
import { resumeCible } from "@/lib/envoi-campagne";
import type {
  SmartListKey,
  SegmentAncienKey,
  DisciplineKey,
} from "@/lib/campagnes";

export const runtime = "nodejs";

// POST — PLANIFIE une campagne (ne l'envoie PAS). Stocke la recette + l'heure
// voulue. Le cron l'enverra le jour J via le même chemin que l'envoi manuel
// (segments recalculés à ce moment-là).
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
    scheduledAt?: string; // ISO
    smartLists?: SmartListKey[];
    anciensSegments?: SegmentAncienKey[];
    disciplines?: DisciplineKey[];
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
  const when = body.scheduledAt ? new Date(body.scheduledAt) : null;
  if (!when || Number.isNaN(when.getTime())) {
    return NextResponse.json({ error: "Date d'envoi invalide." }, { status: 400 });
  }
  if (when.getTime() < Date.now() - 60_000) {
    return NextResponse.json(
      { error: "La date d'envoi doit être dans le futur." },
      { status: 400 },
    );
  }

  const recette = {
    objet,
    contenu,
    smartLists: body.smartLists ?? [],
    anciensSegments: body.anciensSegments ?? [],
    disciplines: body.disciplines ?? [],
    includeContacts: !!body.includeContacts,
    manualEmails: body.manualEmails ?? [],
  };

  const supabase = getSupabaseAdmin();
  const payload: Record<string, unknown> = {
    titre: (body.titre || objet).slice(0, 200),
    objet,
    contenu,
    type: "campagne",
    statut: "planifiee",
    etat: "active",
    scheduled_at: when.toISOString(),
    cible: resumeCible(recette),
    liste_type: "mixte",
    // On stocke la recette COMPLÈTE (dont le tableau d'emails manuels) pour
    // pouvoir rejouer exactement le sourcing au jour J.
    liste_filtre: recette,
    nb_destinataires: null,
  };

  const { data, error } = await supabase
    .from("campagnes")
    .insert(payload)
    .select()
    .single();
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ success: true, campagne: data }, { status: 201 });
}
