import { NextResponse } from "next/server";
import { getSupabaseAdmin, isSupabaseConfigured, exigerData } from "@/lib/supabase";
import { isAdminRequest } from "@/lib/admin-guard";
import { matchKey } from "@/lib/anciennete";
import { statutEssai, provenanceLabel } from "@/lib/statut-essai";
import { formaterTelephoneFr } from "@/lib/telephone";

export const runtime = "nodejs";

// GET /api/admin/presence/essai-detail?id=<essaiId> — détail d'un essai pour la
// modale admin : coordonnées (téléphone, email), provenance, suivi de rappel, et
// STATUT dérivé (statutEssai) depuis le dossier rattaché + ses paiements réels.
// Admin only, fail-closed. Aucune donnée exposée au coach (route séparée).
export async function GET(request: Request) {
  if (!isAdminRequest(request)) return NextResponse.json({ error: "Non autorisé." }, { status: 401 });
  if (!isSupabaseConfigured()) return NextResponse.json({ error: "Supabase non configuré." }, { status: 503 });

  const id = new URL(request.url).searchParams.get("id") || "";
  if (!id) return NextResponse.json({ error: "id requis." }, { status: 400 });

  const supabase = getSupabaseAdmin();
  const essai = exigerData(
    await supabase
      .from("essais")
      .select("id, nom, prenom, date_naissance, email, telephone, provenance, provenance_autre, date_seance, rappele_at, rappel_note, rappele_par, converti_dossier_id")
      .eq("id", id)
      .maybeSingle(),
    "essai-detail: lecture essai",
  );
  if (!essai) return NextResponse.json({ error: "Essai introuvable." }, { status: 404 });

  // 1re séance de la PERSONNE (plus ancienne) — triplet, jamais l'email.
  const cle = matchKey(essai.nom as string, essai.prenom as string, essai.date_naissance as string | null);
  let premiereSeance = essai.date_seance as string;
  if (cle) {
    const tous = exigerData(
      await supabase.from("essais").select("nom, prenom, date_naissance, date_seance"),
      "essai-detail: essais personne",
    );
    for (const e of tous ?? []) {
      if (matchKey(e.nom as string, e.prenom as string, e.date_naissance as string | null) === cle) {
        if ((e.date_seance as string) < premiereSeance) premiereSeance = e.date_seance as string;
      }
    }
  }

  // Dossier rattaché : converti_dossier_id en priorité, sinon triplet.
  type DossierRow = { id: string; nom: string | null; annule_at: string | null; statut_paiement: string | null; echeances_payees: number | null };
  let dossier: DossierRow | null = null;
  const dossierId = (essai.converti_dossier_id as string | null) ?? null;
  if (dossierId) {
    const row = exigerData(
      await supabase.from("adherents").select("id, nom, annule_at, statut_paiement, echeances_payees").eq("id", dossierId).maybeSingle(),
      "essai-detail: dossier lié",
    ) as Record<string, unknown> | null;
    if (row) dossier = { id: row.id as string, nom: (row.nom as string | null) ?? null, annule_at: (row.annule_at as string | null) ?? null, statut_paiement: (row.statut_paiement as string | null) ?? null, echeances_payees: (row.echeances_payees as number | null) ?? null };
  }
  let paiements: { statut: string | null; date_paiement: string | null }[] = [];
  if (dossier) {
    const rows = (exigerData(
      await supabase.from("paiements").select("statut, date_paiement").eq("adherent_id", dossier.id),
      "essai-detail: paiements",
    ) ?? []) as Record<string, unknown>[];
    paiements = rows.map((r) => ({ statut: (r.statut as string | null) ?? null, date_paiement: (r.date_paiement as string | null) ?? null }));
  }

  const statut = statutEssai(
    { date_seance: premiereSeance, converti_dossier_id: dossierId, rappele_at: essai.rappele_at as string | null },
    dossier,
    paiements,
    new Date(),
  );

  return NextResponse.json({
    essai: {
      id: essai.id,
      prenom: essai.prenom,
      nom: essai.nom,
      email: essai.email,
      telephone: essai.telephone,
      telephoneAffiche: formaterTelephoneFr(essai.telephone as string | null),
      provenance: provenanceLabel(essai.provenance as string | null, essai.provenance_autre as string | null),
      premiereSeance,
      rappele_at: essai.rappele_at,
      rappel_note: essai.rappel_note,
      rappele_par: essai.rappele_par,
      converti_dossier_id: dossierId,
    },
    dossier: dossier ? { id: dossier.id, nom: dossier.nom } : null,
    statut,
  });
}
