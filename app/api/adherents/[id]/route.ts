import { NextResponse } from "next/server";
import { getSupabaseAdmin, isSupabaseConfigured } from "@/lib/supabase";
import { sendDocumentActionRequired } from "@/lib/email";

export const runtime = "nodejs";

type Ctx = { params: Promise<{ id: string }> };

// GET — détail d'un adhérent.
export async function GET(_req: Request, { params }: Ctx) {
  const { id } = await params;
  if (!isSupabaseConfigured()) {
    return NextResponse.json({ error: "Supabase non configuré." }, { status: 503 });
  }
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from("adherents")
    .select("*")
    .eq("id", id)
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 404 });
  return NextResponse.json({ adherent: data });
}

// PATCH — mise à jour (ex : confirmer un paiement en espèces).
export async function PATCH(request: Request, { params }: Ctx) {
  const { id } = await params;
  if (!isSupabaseConfigured()) {
    return NextResponse.json({ error: "Supabase non configuré." }, { status: 503 });
  }

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Corps invalide." }, { status: 400 });
  }

  // Liste blanche des champs modifiables depuis l'admin.
  const allowed = [
    "statut_paiement",
    "mode_paiement",
    "nom",
    "prenom",
    "email",
    "telephone",
    "adresse",
    "ville",
    "code_postal",
    "option_prepa_physique",
    "nb_membres_famille",
    // Validation / refus PAR DOCUMENT.
    "fiche_valide",
    "certificat_valide",
    "reglement_valide",
    "photo_valide",
    "fiche_motif_refus",
    "certificat_motif_refus",
    "reglement_motif_refus",
    "photo_motif_refus",
  ];
  const update: Record<string, unknown> = {};
  for (const k of allowed) {
    if (k in body) update[k] = body[k];
  }

  if (body.action === "confirmer_especes") {
    update.statut_paiement = "confirme_especes";
  }

  if (Object.keys(update).length === 0) {
    return NextResponse.json({ error: "Aucun champ à mettre à jour." }, { status: 400 });
  }

  // Un motif de refus non vide est-il posé dans cette requête ? (→ email adhérent)
  const motifRefus = [
    "fiche_motif_refus",
    "certificat_motif_refus",
    "reglement_motif_refus",
    "photo_motif_refus",
  ]
    .map((k) => body[k])
    .find((v) => typeof v === "string" && v.trim()) as string | undefined;

  const supabase = getSupabaseAdmin();
  let { data, error } = await supabase
    .from("adherents")
    .update(update)
    .eq("id", id)
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // documents_valides est DÉRIVÉ : vrai quand les 3 docs OBLIGATOIRES sont
  // validés (fiche + règlement + photo). Le certificat médical ne bloque pas.
  if (data) {
    const derived =
      !!data.fiche_valide && !!data.reglement_valide && !!data.photo_valide;
    if (data.documents_valides !== derived) {
      const r = await supabase
        .from("adherents")
        .update({ documents_valides: derived })
        .eq("id", id)
        .select()
        .single();
      if (!r.error && r.data) data = r.data;
    }
  }

  // Notification email à l'adhérent (best-effort) lorsqu'un document est refusé.
  if (motifRefus && data?.email) {
    try {
      await sendDocumentActionRequired({
        prenom: data.prenom,
        email: data.email,
        motif: motifRefus,
      });
    } catch (e) {
      console.error("Email refus doc:", e);
    }
  }

  return NextResponse.json({ adherent: data });
}
