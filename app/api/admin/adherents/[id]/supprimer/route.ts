import { NextResponse } from "next/server";
import {
  getSupabaseAdmin,
  isSupabaseConfigured,
  STORAGE_BUCKET,
} from "@/lib/supabase";
import { isAdminRequest } from "@/lib/admin-guard";

export const runtime = "nodejs";

type Ctx = { params: Promise<{ id: string }> };

// POST — SUPPRESSION DÉFINITIVE d'un dossier (cas réel : doublon). Irréversible.
// Réservé à l'admin (jamais coach). BLOCAGE FRANC : un dossier avec des
// paiements ENCAISSÉS ne peut pas être supprimé (il faut d'abord rembourser).
// Séquence : vérif existence → refus si argent encaissé → détache profiles
// (sans toucher le compte auth) → supprime les fichiers Storage du dossier →
// DELETE de la ligne (CASCADE paiements + remboursements). Le customer Stripe
// est laissé (inoffensif : sans ligne paiements, aucun prélèvement ne part).
export async function POST(request: Request, { params }: Ctx) {
  const { id } = await params;
  if (!isAdminRequest(request)) {
    return NextResponse.json({ error: "Non autorisé." }, { status: 401 });
  }
  if (!isSupabaseConfigured()) {
    return NextResponse.json({ error: "Supabase non configuré." }, { status: 503 });
  }

  const supabase = getSupabaseAdmin();

  // 1) Existence + champs nécessaires au garde-fou "argent encaissé".
  const { data: adherent } = await supabase
    .from("adherents")
    .select("id, statut_paiement, echeances_payees, montant_rembourse")
    .eq("id", id)
    .maybeSingle();
  if (!adherent) {
    return NextResponse.json({ error: "Dossier introuvable." }, { status: 404 });
  }

  // 2) Garde-fou : de l'argent a-t-il été encaissé ? (soldé, ≥1 échéance payée,
  //    remboursement effectué, ou une ligne paiements payée/remboursée).
  let aArgentEncaisse =
    adherent.statut_paiement === "paye" ||
    adherent.statut_paiement === "confirme_especes" ||
    (adherent.echeances_payees ?? 0) >= 1 ||
    Number(adherent.montant_rembourse ?? 0) > 0;

  if (!aArgentEncaisse) {
    const { data: pays } = await supabase
      .from("paiements")
      .select("id")
      .eq("adherent_id", id)
      .in("statut", ["paye", "rembourse"])
      .limit(1);
    aArgentEncaisse = (pays?.length ?? 0) > 0;
  }

  if (aArgentEncaisse) {
    return NextResponse.json(
      {
        error:
          "Ce dossier a des paiements encaissés. Pour le supprimer, effectuez d'abord un remboursement (Gérer le paiement).",
        aArgentEncaisse: true,
      },
      { status: 409 },
    );
  }

  // 3) Détacher les profils liés (espace adhérent) — la FK profiles.adherent_id
  //    est NO ACTION et bloquerait le DELETE. On garde le compte auth.
  const { error: profErr } = await supabase
    .from("profiles")
    .update({ adherent_id: null })
    .eq("adherent_id", id);
  if (profErr) {
    return NextResponse.json(
      { error: "Impossible de détacher le compte lié : " + profErr.message },
      { status: 500 },
    );
  }

  // 4) Supprimer les fichiers Storage du dossier <id>/ (best-effort, loggé).
  //    Aucun lien SQL → sans ça, fichiers orphelins.
  let filesRemoved = 0;
  try {
    const { data: fichiers } = await supabase.storage
      .from(STORAGE_BUCKET)
      .list(id);
    const chemins = (fichiers ?? []).map((f) => `${id}/${f.name}`);
    if (chemins.length) {
      const { error: rmErr } = await supabase.storage
        .from(STORAGE_BUCKET)
        .remove(chemins);
      if (rmErr) console.error("Suppression fichiers Storage (ignoré):", rmErr.message);
      else filesRemoved = chemins.length;
    }
  } catch (e) {
    console.error("Suppression fichiers Storage (ignoré):", e);
  }

  // 5) DELETE de la ligne → CASCADE paiements + remboursements.
  const { error: delErr } = await supabase
    .from("adherents")
    .delete()
    .eq("id", id);
  if (delErr) {
    return NextResponse.json(
      { error: "Suppression impossible : " + delErr.message },
      { status: 500 },
    );
  }

  return NextResponse.json({ success: true, filesRemoved });
}
