import { NextResponse } from "next/server";
import { getSupabaseAdmin, isSupabaseConfigured } from "@/lib/supabase";
import { isAdminRequest } from "@/lib/admin-guard";
import { presenceActif } from "@/lib/presence";
import { retirerPresence } from "@/lib/presence-server";

export const runtime = "nodejs";

// POST /api/admin/presence/retirer — { presenceId } (retrait d'une présence).
export async function POST(request: Request) {
  if (!presenceActif()) return NextResponse.json({ error: "Module désactivé." }, { status: 404 });
  if (!isAdminRequest(request)) return NextResponse.json({ error: "Non autorisé." }, { status: 401 });
  if (!isSupabaseConfigured()) return NextResponse.json({ error: "Indisponible." }, { status: 503 });

  let body: { presenceId?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Corps invalide." }, { status: 400 });
  }
  const id = (body.presenceId || "").trim();
  if (!id) return NextResponse.json({ error: "Présence requise." }, { status: 400 });

  const supabase = getSupabaseAdmin();
  // Retrait + suppression de la fiche d'essai si c'était sa dernière présence
  // (→ plus de relances), via la logique partagée (source unique).
  const r = await retirerPresence(supabase, id);
  if (!r.ok) return NextResponse.json({ error: r.error ?? "Retrait impossible." }, { status: 500 });
  return NextResponse.json({ ok: true, essaiSupprime: r.essaiSupprime });
}
