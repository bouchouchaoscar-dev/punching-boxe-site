import { NextResponse } from "next/server";
import { isStripeConfigured } from "@/lib/stripe";
import { getSupabaseAdmin, isSupabaseConfigured, exigerData } from "@/lib/supabase";
import { getAuthUser } from "@/lib/auth-server";
import { choisirModeSupplement } from "@/lib/changement-formule-server";
import type { Adherent } from "@/lib/types";

export const runtime = "nodejs";

// POST /api/mon-espace/supplement/choisir — l'adhérent choisit le mode de
// règlement (carte / espèces) d'un supplément « à régler » créé par l'admin.
// Espèces → ligne en attente (confirmation admin ensuite). Carte → PaymentIntent
// + clientSecret pour le tunnel existant (confirmé via supplement/confirm).
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
  const mode = body.mode;
  if (!adherentId) return NextResponse.json({ error: "Dossier non précisé." }, { status: 400 });
  if (mode !== "carte" && mode !== "especes") return NextResponse.json({ error: "Mode invalide (carte ou espèces)." }, { status: 400 });
  if (mode === "carte" && !isStripeConfigured()) return NextResponse.json({ error: "Paiement en ligne non configuré." }, { status: 503 });

  const supabase = getSupabaseAdmin();
  const { data: adh } = await supabase.from("adherents").select("*").eq("id", adherentId).maybeSingle();
  if (!adh) return NextResponse.json({ error: "Dossier introuvable." }, { status: 404 });
  const adherent = adh as Adherent;
  if (adherent.titulaire_id !== user.id) {
    return NextResponse.json({ error: "Ce dossier n'appartient pas à votre compte." }, { status: 403 });
  }

  // Supplément « à régler » (mode non encore choisi) le plus récent.
  const chs = exigerData(
    await supabase
      .from("changements_formule")
      .select("id, montant_cents, mode_reglement, statut, paiement_id")
      .eq("dossier_id", adherentId)
      .eq("statut", "actif")
      .eq("mode_reglement", "a_regler")
      .order("created_at", { ascending: false }),
    "choisir supplément: changements",
  );
  const ch = (chs ?? [])[0];
  if (!ch) return NextResponse.json({ error: "Aucun supplément à régler." }, { status: 404 });

  const r = await choisirModeSupplement(supabase, adherent, { id: ch.id as string, montant_cents: ch.montant_cents as number }, mode);
  if (mode === "especes") {
    return NextResponse.json({ ok: true, mode: "especes", montant: Number(ch.montant_cents ?? 0) / 100 });
  }
  return NextResponse.json({
    ok: true,
    mode: "carte",
    intentType: "payment",
    clientSecret: r.clientSecret,
    adherentId,
    paiementId: r.paiementId,
    montant: Number(ch.montant_cents ?? 0) / 100,
  });
}
