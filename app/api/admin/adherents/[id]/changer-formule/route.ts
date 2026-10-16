import { NextResponse } from "next/server";
import { getSupabaseAdmin, isSupabaseConfigured } from "@/lib/supabase";
import { isAdminRequest } from "@/lib/admin-guard";
import { appliquerChangementActif } from "@/lib/changement-formule-server";
import { FORMULES_CLE, labelFormuleDossier } from "@/lib/changement-formule";
import { formuleCle, type FormuleCle, type PackageType } from "@/lib/pricing";
import type { Adherent } from "@/lib/types";

export const runtime = "nodejs";

type Ctx = { params: Promise<{ id: string }> };

// POST /api/admin/adherents/[id]/changer-formule — activation IMMÉDIATE. Montant
// SAISI par l'admin (serveur ne le recalcule pas ici : arbitrage au cas par cas).
// Remboursement = tracé ici ; le mouvement d'argent passe par « Gérer le paiement »
// (remboursement existant, plafonné au réellement encaissé). Fail-closed admin.
export async function POST(request: Request, { params }: Ctx) {
  const { id } = await params;
  if (!isAdminRequest(request)) return NextResponse.json({ error: "Non autorisé." }, { status: 401 });
  if (!isSupabaseConfigured()) return NextResponse.json({ error: "Supabase non configuré." }, { status: 503 });

  let body: {
    nouvelleFormule?: FormuleCle;
    montantEuros?: number;
    sens?: "supplement" | "remboursement" | "aucun";
    modeReglement?: "carte" | "especes" | "offert" | "remboursement_carte" | "remboursement_hors_ligne" | null;
    motif?: string | null;
  };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Corps invalide." }, { status: 400 });
  }
  const nouvelleCle = body.nouvelleFormule;
  if (!nouvelleCle || !FORMULES_CLE.includes(nouvelleCle)) {
    return NextResponse.json({ error: "Formule invalide." }, { status: 400 });
  }
  const sens = body.sens ?? "aucun";
  const montantEuros = Math.max(0, Math.round(Number(body.montantEuros || 0) * 100) / 100);

  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase.from("adherents").select("*").eq("id", id).maybeSingle();
  if (error || !data) return NextResponse.json({ error: "Dossier introuvable." }, { status: 404 });
  const adherent = data as Adherent;
  if (adherent.annule_at) return NextResponse.json({ error: "Dossier annulé." }, { status: 409 });

  const ancienne = formuleCle(adherent.package as PackageType, adherent.option_prepa_physique ?? false);
  if (ancienne === nouvelleCle) {
    return NextResponse.json({ error: "C'est déjà la formule actuelle du dossier." }, { status: 409 });
  }

  // Mode effectif selon le sens.
  let mode: typeof body.modeReglement = null;
  let montant = 0;
  if (sens === "supplement") {
    mode = (body.modeReglement === "carte" || body.modeReglement === "especes" || body.modeReglement === "offert") ? body.modeReglement : null;
    if (!mode) return NextResponse.json({ error: "Mode de règlement du supplément requis (carte, espèces ou offert)." }, { status: 400 });
    montant = mode === "offert" ? 0 : montantEuros;
    if (mode !== "offert" && montant <= 0) return NextResponse.json({ error: "Montant du supplément requis." }, { status: 400 });
  } else if (sens === "remboursement") {
    mode = (body.modeReglement === "remboursement_carte" || body.modeReglement === "remboursement_hors_ligne") ? body.modeReglement : "remboursement_hors_ligne";
    montant = montantEuros; // magnitude ; le mouvement d'argent se fait via « Gérer le paiement »
  }

  const r = await appliquerChangementActif(supabase, adherent, {
    nouvelleCle,
    montantEuros: montant,
    modeReglement: mode,
    source: "admin",
    createdBy: "admin",
    motif: body.motif ?? null,
    signatureRequise: true, // la fiche change → re-signature
  });

  return NextResponse.json({
    ok: true,
    changementId: r.changementId,
    ancienne: labelFormuleDossier(adherent),
    nouvelle: nouvelleCle,
    // Pour un remboursement carte : l'UI enchaîne sur « Gérer le paiement » (remboursement existant).
    remboursement: sens === "remboursement" ? { canal: mode === "remboursement_carte" ? "stripe" : "hors_ligne", montant } : null,
  });
}
