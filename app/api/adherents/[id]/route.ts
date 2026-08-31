import { NextResponse } from "next/server";
import { getSupabaseAdmin, isSupabaseConfigured } from "@/lib/supabase";
import { sendDocumentActionRequired } from "@/lib/email";
import { evaluerDossier } from "@/lib/dossier";
import { notifierSiDossierComplet } from "@/lib/dossier-complet";

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
    // Badge "Nouveau" : marqué vu quand l'admin ouvre la fiche.
    "vu_par_admin",
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

  // Nom / prénom : obligatoires non vides (ils figurent sur les documents
  // signés). Trim conservé (accents/trémas UTF-8 préservés, ex. « ö »).
  for (const k of ["nom", "prenom"] as const) {
    if (k in update) {
      const v = typeof update[k] === "string" ? (update[k] as string).trim() : "";
      if (!v) {
        return NextResponse.json(
          { error: `Le ${k === "nom" ? "nom" : "prénom"} ne peut pas être vide.` },
          { status: 400 },
        );
      }
      update[k] = v;
    }
  }

  if (body.action === "confirmer_especes") {
    update.statut_paiement = "confirme_especes";
  }

  if (Object.keys(update).length === 0) {
    return NextResponse.json({ error: "Aucun champ à mettre à jour." }, { status: 400 });
  }

  // Un motif de refus non vide est-il posé dans cette requête ? (→ email adhérent)
  const DOC_LABELS: Record<string, string> = {
    fiche_motif_refus: "Fiche d'inscription",
    certificat_motif_refus: "Certificat médical",
    reglement_motif_refus: "Règlement intérieur",
    photo_motif_refus: "Photo d'identité",
  };
  const champRefus = Object.keys(DOC_LABELS).find(
    (k) => typeof body[k] === "string" && (body[k] as string).trim(),
  );
  const motifRefus = champRefus ? (body[champRefus] as string).trim() : undefined;
  const docLabelRefus = champRefus ? DOC_LABELS[champRefus] : undefined;

  const supabase = getSupabaseAdmin();

  // Engagement : si cette MAJ passe le dossier à payé/espèces confirmées, on fige
  // engage_at une seule fois (s'il est encore null en base).
  if (
    update.statut_paiement === "paye" ||
    update.statut_paiement === "confirme_especes"
  ) {
    const { data: cur } = await supabase
      .from("adherents")
      .select("engage_at")
      .eq("id", id)
      .maybeSingle();
    if (cur && !cur.engage_at) update.engage_at = new Date().toISOString();
  }

  // Garde-fou re-signature : si un champ figurant sur les documents SIGNÉS
  // (nom, prénom, date de naissance) change RÉELLEMENT, on lève les deux flags
  // « à re-signer » (les deux docs portent ces infos). PAS de mail ici :
  // l'admin déclenchera l'envoi via le bouton (il garde la main sur le moment).
  const CHAMPS_DOCS = ["nom", "prenom", "date_naissance"] as const;
  if (CHAMPS_DOCS.some((k) => k in update)) {
    const { data: avant } = await supabase
      .from("adherents")
      .select("nom, prenom, date_naissance")
      .eq("id", id)
      .maybeSingle();
    const change =
      !!avant &&
      CHAMPS_DOCS.some(
        (k) => k in update && String(update[k] ?? "") !== String(avant[k] ?? ""),
      );
    if (change) {
      update.fiche_a_resigner = true;
      update.reglement_a_resigner = true;
    }
  }

  let { data, error } = await supabase
    .from("adherents")
    .update(update)
    .eq("id", id)
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // documents_valides est DÉRIVÉ : vrai UNIQUEMENT quand les 4 documents sont
  // validés (fiche + règlement + photo + certificat médical).
  if (data) {
    const derived = evaluerDossier(data).documentsValides;
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

  // Espèces confirmées → enregistrer l'ENCAISSEMENT (ligne paiements payée), pour
  // que le montant compte dans "Encaissé" (fiche + liste). Idempotent : on
  // n'insère que s'il n'existe encore aucune ligne payée pour ce dossier.
  if (data?.statut_paiement === "confirme_especes") {
    const { count } = await supabase
      .from("paiements")
      .select("id", { count: "exact", head: true })
      .eq("adherent_id", id)
      .eq("statut", "paye");
    if ((count ?? 0) === 0) {
      await supabase.from("paiements").insert({
        adherent_id: id,
        montant: data.montant_total,
        statut: "paye",
        numero_echeance: null,
        date_paiement: new Date().toISOString(),
      });
    }
  }

  // Le dossier vient peut-être de basculer à COMPLET (dernière pièce validée ou
  // espèces confirmées) → mail « dossier validé » (une seule fois, best-effort).
  await notifierSiDossierComplet(supabase, id);

  // Notification email à l'adhérent (best-effort) lorsqu'un document est refusé.
  if (motifRefus && data?.email) {
    try {
      await sendDocumentActionRequired({
        prenom: data.prenom,
        email: data.email,
        docLabel: docLabelRefus,
        motif: motifRefus,
      });
    } catch (e) {
      console.error("Email refus doc:", e);
    }
  }

  return NextResponse.json({ adherent: data });
}
