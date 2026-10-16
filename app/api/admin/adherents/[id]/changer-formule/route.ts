import { NextResponse } from "next/server";
import { getSupabaseAdmin, isSupabaseConfigured } from "@/lib/supabase";
import { isAdminRequest } from "@/lib/admin-guard";
import { appliquerChangementActif } from "@/lib/changement-formule-server";
import { FORMULES_CLE, labelFormuleDossier, resoudreChangementAdmin } from "@/lib/changement-formule";
import { formuleCle, type FormuleCle, type PackageType } from "@/lib/pricing";
import { estEngage } from "@/lib/engagement";
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
    // Supplément : « à régler par l'adhérent » (il choisira carte ou espèces en
    // signant sa nouvelle fiche) ou « offert ». Remboursement : carte / hors-ligne.
    reglement?: "a_regler" | "offert" | "remboursement_carte" | "remboursement_hors_ligne";
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

  // CAS a / b (même règle que le parcours adhérent) : rien d'encaissé ni engagé
  // → le supplément/la réduction est FUSIONNÉ dans montant_total (pas de paiement
  // séparé). Sinon → supplément/remboursement séparé. Fail-closed : seuls « à
  // régler par l'adhérent » et « offert » sont acceptés pour un supplément (toute
  // autre valeur, dont l'ancien « réglé sur place en espèces », est refusée).
  const engage = estEngage(adherent);
  const total = Number(adherent.montant_total || 0);
  const resolution = resoudreChangementAdmin({ sens, reglement: body.reglement ?? null, montantEuros, engage, total });
  if (!resolution.ok) return NextResponse.json({ error: resolution.error }, { status: 400 });
  const { mode, montant, nouveauTotal } = resolution;

  const r = await appliquerChangementActif(supabase, adherent, {
    nouvelleCle,
    montantEuros: montant,
    modeReglement: mode,
    source: "admin",
    createdBy: "admin",
    motif: body.motif ?? null,
    signatureRequise: true, // la fiche change → re-signature
    nouveauTotal,
  });

  return NextResponse.json({
    ok: true,
    changementId: r.changementId,
    fusionne: nouveauTotal != null,
    nouveauTotal,
    ancienne: labelFormuleDossier(adherent),
    nouvelle: nouvelleCle,
    remboursement: sens === "remboursement" && engage ? { canal: mode === "remboursement_carte" ? "stripe" : "hors_ligne", montant: montantEuros } : null,
  });
}
