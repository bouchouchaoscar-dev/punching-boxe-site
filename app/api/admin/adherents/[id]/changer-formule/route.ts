import { NextResponse } from "next/server";
import { getSupabaseAdmin, isSupabaseConfigured } from "@/lib/supabase";
import { isAdminRequest } from "@/lib/admin-guard";
import { appliquerChangementActif } from "@/lib/changement-formule-server";
import { FORMULES_CLE, labelFormuleDossier } from "@/lib/changement-formule";
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
    // Supplément : l'admin choisit QUI/COMMENT règle — « à régler par l'adhérent »
    // (il choisira carte/espèces), « réglé sur place en espèces » (encaissé), ou
    // « offert ». Remboursement : carte / hors-ligne.
    reglement?: "a_regler" | "especes_sur_place" | "offert" | "remboursement_carte" | "remboursement_hors_ligne";
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
  // séparé, pas de remboursement). Sinon → supplément/remboursement séparé.
  const engage = estEngage(adherent);
  const total = Number(adherent.montant_total || 0);
  let mode: Parameters<typeof appliquerChangementActif>[2]["modeReglement"] = null;
  let montant = 0;
  let nouveauTotal: number | null = null;
  let encaisse = false;
  let confirmerCotisationEspeces = false; // cas a « réglé sur place » : encaisser le total

  if (sens === "supplement") {
    const reglement = body.reglement;
    if (reglement === "offert") {
      mode = "offert"; montant = 0; // formule changée sans montant
    } else if (reglement === "a_regler" || reglement === "especes_sur_place") {
      if (montantEuros <= 0) return NextResponse.json({ error: "Montant du supplément requis." }, { status: 400 });
      if (!engage) {
        // CAS a : fusion dans le total. « réglé sur place » → on encaisse aussi le total.
        mode = null; montant = montantEuros; nouveauTotal = Math.round((total + montantEuros) * 100) / 100;
        confirmerCotisationEspeces = reglement === "especes_sur_place";
      } else if (reglement === "especes_sur_place") {
        mode = "especes"; montant = montantEuros; encaisse = true; // ligne paiements encaissée directement
      } else {
        mode = "a_regler"; montant = montantEuros; // l'adhérent choisira carte/espèces dans son espace
      }
    } else {
      return NextResponse.json({ error: "Choix de règlement du supplément requis." }, { status: 400 });
    }
  } else if (sens === "remboursement") {
    if (montantEuros <= 0) return NextResponse.json({ error: "Montant du remboursement requis." }, { status: 400 });
    if (!engage) {
      mode = null; montant = -montantEuros; nouveauTotal = Math.round((total - montantEuros) * 100) / 100; // réduction = baisse du total
    } else {
      mode = body.reglement === "remboursement_carte" ? "remboursement_carte" : "remboursement_hors_ligne";
      montant = montantEuros; // le mouvement d'argent passe par « Gérer le paiement »
    }
  }

  const r = await appliquerChangementActif(supabase, adherent, {
    nouvelleCle,
    montantEuros: montant,
    modeReglement: mode,
    source: "admin",
    createdBy: "admin",
    motif: body.motif ?? null,
    signatureRequise: true, // la fiche change → re-signature
    nouveauTotal,
    encaisse,
  });

  // Cas a « réglé sur place en espèces » : on encaisse la cotisation (nouveau total)
  // → confirmation espèces du dossier (engage + confirme_especes).
  if (confirmerCotisationEspeces) {
    await supabase
      .from("adherents")
      .update({ mode_paiement: "especes", statut_paiement: "confirme_especes", engage_at: adherent.engage_at ?? new Date().toISOString() })
      .eq("id", id);
  }

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
