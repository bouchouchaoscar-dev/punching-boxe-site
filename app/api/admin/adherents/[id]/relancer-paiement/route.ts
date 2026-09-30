import { NextResponse } from "next/server";
import { getSupabaseAdmin, isSupabaseConfigured, exigerData } from "@/lib/supabase";
import { isAdminRequest } from "@/lib/admin-guard";
import { sendRelancePanier } from "@/lib/email";
import { estPaiementAFinaliser } from "@/lib/paiement";
import type { Adherent } from "@/lib/types";

export const runtime = "nodejs";

type Ctx = { params: Promise<{ id: string }> };

// POST — RELANCE MANUELLE (admin) du paiement d'un dossier CARTE en attente.
// Réutilise sendRelancePanier (deep-link /inscription/finaliser/[id], 1x +
// fractionné). GARDE SERVEUR sur la signature de cible (espèces exclus) — pas
// seulement l'UI. Renvoi AUTORISÉ (Pascal peut relancer plusieurs fois) : on ne
// bloque pas le 2e clic, mais on renvoie la date du dernier envoi pour l'UI.
export async function POST(request: Request, { params }: Ctx) {
  if (!isAdminRequest(request)) {
    return NextResponse.json({ error: "Non autorisé." }, { status: 401 });
  }
  const { id } = await params;
  if (!isSupabaseConfigured()) {
    return NextResponse.json({ error: "Supabase non configuré." }, { status: 503 });
  }

  const supabase = getSupabaseAdmin();
  const data = exigerData(
    await supabase
      .from("adherents")
      .select("*")
      .eq("id", id)
      .maybeSingle(),
    "relance paiement: lecture adhérent",
  );
  if (!data) {
    return NextResponse.json({ error: "Dossier introuvable." }, { status: 404 });
  }
  const a = data as Adherent;

  // GARDE SERVEUR : dossier « à finaliser » (SOURCE UNIQUE statutTrombi). Couvre
  // la carte non finalisée ET le dossier sans mode de paiement choisi. Espèces /
  // payés / échecs / engagés / annulés → exclus. Hors cible = refusé (409).
  if (!estPaiementAFinaliser(a)) {
    return NextResponse.json(
      { error: "Ce dossier n'est pas un paiement à finaliser." },
      { status: 409 },
    );
  }
  if (!a.email) {
    return NextResponse.json(
      { error: "Aucune adresse email sur ce dossier." },
      { status: 409 },
    );
  }

  const precedente = a.relance_paiement_manuelle_at ?? null;
  try {
    await sendRelancePanier({ prenom: a.prenom ?? "", email: a.email, adherentId: a.id });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Envoi du mail impossible." },
      { status: 502 },
    );
  }

  // Trace (best-effort : n'échoue pas si la colonne 008 n'est pas encore migrée).
  const nowIso = new Date().toISOString();
  await supabase
    .from("adherents")
    .update({ relance_paiement_manuelle_at: nowIso })
    .eq("id", id);

  return NextResponse.json({
    success: true,
    relance_paiement_manuelle_at: nowIso,
    precedente,
  });
}
