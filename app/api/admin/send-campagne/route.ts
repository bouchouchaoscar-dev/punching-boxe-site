import { NextResponse } from "next/server";
import { getSupabaseAdmin, isSupabaseConfigured } from "@/lib/supabase";
import { isAdminRequest } from "@/lib/admin-guard";
import { envoyerCampagne } from "@/lib/envoi-campagne";
import type {
  SmartListKey,
  SegmentAncienKey,
  DisciplineKey,
} from "@/lib/campagnes";

export const runtime = "nodejs";

// Envoi IMMÉDIAT d'une campagne. La logique d'envoi est partagée avec les
// campagnes planifiées (cf. lib/envoi-campagne.ts) → un envoi manuel et un
// envoi planifié produisent exactement le même résultat.
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

  const supabase = getSupabaseAdmin();
  const res = await envoyerCampagne(supabase, {
    objet: body.objet || "",
    contenu: body.contenu || "",
    smartLists: body.smartLists,
    anciensSegments: body.anciensSegments,
    disciplines: body.disciplines,
    includeContacts: body.includeContacts,
    manualEmails: body.manualEmails,
  });

  if (!res.ok && res.emailsEnvoyes === 0 && res.error) {
    // Rien envoyé (objet/contenu manquant, aucun destinataire, Resend off…).
    const status = /destinataire/i.test(res.error) ? 400 : res.error.includes("RESEND") ? 503 : 400;
    return NextResponse.json({ error: res.error, exclus: res.exclus }, { status });
  }

  // Sauvegarde dans l'historique (type='campagne').
  const insertPayload: Record<string, unknown> = {
    titre: (body.titre || body.objet || "").slice(0, 200),
    objet: (body.objet || "").trim(),
    contenu: (body.contenu || "").trim(),
    type: "campagne",
    cible: res.cible,
    liste_type: "mixte",
    liste_filtre: {
      smartLists: body.smartLists ?? [],
      anciensSegments: body.anciensSegments ?? [],
      disciplines: body.disciplines ?? [],
      includeContacts: !!body.includeContacts,
      manualEmails: (body.manualEmails ?? []).length,
    },
    nb_destinataires: res.personnesCiblees,
    nb_envoyes: res.emailsEnvoyes,
    nb_exclus: res.exclus + res.exclusSansEmail,
    statut: res.emailsEnvoyes > 0 ? "envoye" : "erreur",
    envoye_at: new Date().toISOString(),
    destinataires_liste: res.destinatairesListe,
  };
  const colonnesOptionnelles = [
    "destinataires_liste",
    "type",
    "cible",
    "nb_envoyes",
    "nb_exclus",
  ];
  let insErr: { message: string } | null = null;
  for (;;) {
    ({ error: insErr } = await supabase.from("campagnes").insert(insertPayload));
    if (!insErr) break;
    const offending = colonnesOptionnelles.find((k) => insErr!.message.includes(k));
    if (!offending) break;
    delete insertPayload[offending];
  }
  if (insErr) console.error("Insert campagne:", insErr);

  return NextResponse.json({
    success: res.emailsEnvoyes > 0,
    emails: res.emailsEnvoyes,
    personnes: res.personnesCiblees,
    doublons: res.doublons,
    exclus: res.exclus,
    exclusSansEmail: res.exclusSansEmail,
  });
}
