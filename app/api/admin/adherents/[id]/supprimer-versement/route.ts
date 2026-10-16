import { NextResponse } from "next/server";
import { getSupabaseAdmin, isSupabaseConfigured } from "@/lib/supabase";
import { isAdminRequest } from "@/lib/admin-guard";
import { supprimerVersementEspeces } from "@/lib/payments";

export const runtime = "nodejs";

type Ctx = { params: Promise<{ id: string }> };

// POST /api/admin/adherents/[id]/supprimer-versement — supprime UN versement
// espèces (correction d'erreur) et recalcule le statut. Refuse toute ligne qui
// n'est pas un versement espèces. Fail-closed admin.
export async function POST(request: Request, { params }: Ctx) {
  const { id } = await params;
  if (!isAdminRequest(request)) return NextResponse.json({ error: "Non autorisé." }, { status: 401 });
  if (!isSupabaseConfigured()) return NextResponse.json({ error: "Supabase non configuré." }, { status: 503 });

  let body: { versementId?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Corps invalide." }, { status: 400 });
  }
  const versementId = String(body.versementId || "").trim();
  if (!versementId) return NextResponse.json({ error: "versementId requis." }, { status: 400 });

  const supabase = getSupabaseAdmin();
  const r = await supprimerVersementEspeces(supabase, { adherentId: id, versementId });
  if (!r.ok) return NextResponse.json({ error: r.error }, { status: r.status });
  return NextResponse.json({ ok: true, ...r.cible, solde: r.cible.reste === 0 });
}
