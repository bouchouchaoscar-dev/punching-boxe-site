import { NextResponse } from "next/server";
import { getSupabaseAdmin, isSupabaseConfigured } from "@/lib/supabase";
import { getAuthUser } from "@/lib/auth-server";
import { estEngage } from "@/lib/engagement";
import { peutAjouterPrepa, prixOptionPrepa } from "@/lib/changement-formule";
import { creerSupplementCarte, appliquerChangementActif, lienSignatureFiche } from "@/lib/changement-formule-server";
import { prepaDuMois } from "@/lib/pricing";
import type { Adherent } from "@/lib/types";

export const runtime = "nodejs";

// POST /api/mon-espace/ajouter-prepa — l'adhérent ajoute l'option prépa à un
// dossier « Boxe Française seule ». Prix calculé SERVEUR (palier du jour), jamais
// repris du client. Cas (a) sans encaissement → formule + total recalculés, paiement
// par le tunnel existant. Cas (b) avec encaissement → supplément séparé carte/espèces.
export async function POST(request: Request) {
  if (!isSupabaseConfigured()) return NextResponse.json({ error: "Indisponible." }, { status: 503 });
  const user = await getAuthUser(request);
  if (!user) return NextResponse.json({ error: "Non authentifié." }, { status: 401 });

  let body: { adherentId?: string; mode?: "carte" | "especes" };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Corps invalide." }, { status: 400 });
  }
  const adherentId = String(body.adherentId || "").trim();
  if (!adherentId) return NextResponse.json({ error: "Dossier non précisé." }, { status: 400 });

  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase.from("adherents").select("*").eq("id", adherentId).maybeSingle();
  if (error || !data) return NextResponse.json({ error: "Dossier introuvable." }, { status: 404 });
  const adherent = data as Adherent;
  if (adherent.titulaire_id !== user.id) {
    return NextResponse.json({ error: "Ce dossier n'appartient pas à votre compte." }, { status: 403 });
  }
  if (!peutAjouterPrepa(adherent)) {
    return NextResponse.json({ error: "L'option prépa n'est pas disponible pour ce dossier." }, { status: 409 });
  }

  // Prix de l'option au palier DU JOUR (moteur), sans adhésion ni remise.
  const prixAujourdhui = prixOptionPrepa(new Date());

  // CAS (a) : rien d'encaissé ni d'engagé → pas de supplément séparé. La formule
  // passe en BF + Prépa, le total est recalculé avec le palier d'INSCRIPTION, et
  // la personne paie normalement par le tunnel existant (finaliser).
  if (!estEngage(adherent)) {
    const prepaInscription = prepaDuMois(new Date(adherent.created_at ?? new Date().toISOString()));
    const nouveauTotal = Math.round((Number(adherent.montant_total || 0) + prepaInscription) * 100) / 100;
    await appliquerChangementActif(supabase, adherent, {
      nouvelleCle: "boxe_prepa",
      montantEuros: prepaInscription,
      modeReglement: null, // folds into the cotisation total
      source: "adherent",
      createdBy: "adherent",
      signatureRequise: true,
      nouveauTotal,
    });
    return NextResponse.json({ cas: "a", nouveauTotal, signature: lienSignatureFiche(adherentId) });
  }

  // CAS (b) : encaissement/engagement existant → supplément séparé, en une fois.
  const mode = body.mode;
  if (mode === "especes") {
    await appliquerChangementActif(supabase, adherent, {
      nouvelleCle: "boxe_prepa",
      montantEuros: prixAujourdhui,
      modeReglement: "especes",
      source: "adherent",
      createdBy: "adherent",
      signatureRequise: true,
    });
    return NextResponse.json({ cas: "b_especes", montant: prixAujourdhui, signature: lienSignatureFiche(adherentId) });
  }
  if (mode === "carte") {
    // Option B : la formule n'est activée qu'à la confirmation (webhook). Rien ne
    // change avant paiement ; re-signature après confirmation.
    const r = await creerSupplementCarte(supabase, adherent, {
      nouvelleCle: "boxe_prepa",
      montantEuros: prixAujourdhui,
      source: "adherent",
      createdBy: "adherent",
    });
    return NextResponse.json({
      cas: "b_carte",
      intentType: "payment",
      clientSecret: r.clientSecret,
      adherentId,
      paiementId: r.paiementId,
      montant: prixAujourdhui,
    });
  }
  return NextResponse.json({ error: "Mode de paiement requis (carte ou especes)." }, { status: 400 });
}
