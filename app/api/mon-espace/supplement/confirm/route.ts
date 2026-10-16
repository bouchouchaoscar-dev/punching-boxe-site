import { NextResponse } from "next/server";
import { getStripe, isStripeConfigured } from "@/lib/stripe";
import { getSupabaseAdmin, isSupabaseConfigured } from "@/lib/supabase";
import { getAuthUser } from "@/lib/auth-server";
import { marquerEcheancePayee } from "@/lib/payments";
import { lienSignatureFiche } from "@/lib/changement-formule-server";

export const runtime = "nodejs";

// POST /api/mon-espace/supplement/confirm — confirme le paiement carte d'un
// supplément de changement de formule (cas b, option B). À la confirmation :
// marquerEcheancePayee → recalculerSupplement ACTIVE la formule + marque la fiche
// à re-signer. Idempotent. Renvoie le lien de signature pour la continuité.
export async function POST(request: Request) {
  if (!isStripeConfigured() || !isSupabaseConfigured()) {
    return NextResponse.json({ error: "Non configuré." }, { status: 503 });
  }
  const user = await getAuthUser(request);
  if (!user) return NextResponse.json({ error: "Non authentifié." }, { status: 401 });

  let body: { adherentId?: string; paiementId?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Corps invalide." }, { status: 400 });
  }
  const adherentId = String(body.adherentId || "").trim();
  if (!adherentId) return NextResponse.json({ error: "Dossier non précisé." }, { status: 400 });

  const supabase = getSupabaseAdmin();
  const { data: adh } = await supabase
    .from("adherents")
    .select("id, titulaire_id")
    .eq("id", adherentId)
    .maybeSingle();
  if (!adh) return NextResponse.json({ error: "Dossier introuvable." }, { status: 404 });
  if (adh.titulaire_id !== user.id) {
    return NextResponse.json({ error: "Ce dossier n'appartient pas à votre compte." }, { status: 403 });
  }

  // Dernier changement carte avec un PI à confirmer (cas b adhérent-ajout en
  // attente de paiement, OU supplément admin « à régler » que l'adhérent a réglé
  // par carte : statut actif, mode carte, PI présent).
  const { data: ch } = await supabase
    .from("changements_formule")
    .select("id, payment_intent_id, paiement_id, statut")
    .eq("dossier_id", adherentId)
    .eq("mode_reglement", "carte")
    .not("payment_intent_id", "is", null)
    .in("statut", ["en_attente_paiement", "actif"])
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (!ch || !ch.payment_intent_id) {
    return NextResponse.json({ error: "Aucun supplément à confirmer." }, { status: 404 });
  }

  const intent = await getStripe().paymentIntents.retrieve(ch.payment_intent_id as string);
  if (intent.status !== "succeeded") {
    return NextResponse.json({ paid: false, status: intent.status });
  }
  // Marque le paiement supplément payé → recalculerSupplement active la formule.
  await marquerEcheancePayee(intent.id);
  return NextResponse.json({ paid: true, signature: lienSignatureFiche(adherentId) });
}
