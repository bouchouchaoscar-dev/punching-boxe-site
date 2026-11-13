import { NextResponse } from "next/server";
import { getSupabaseAdmin, isSupabaseConfigured, exigerData } from "@/lib/supabase";
import { isAdminRequest } from "@/lib/admin-guard";
import { decalerEcheances } from "@/lib/payments";
import { partiesParis } from "@/lib/presence";

export const runtime = "nodejs";

type Ctx = { params: Promise<{ id: string }> };

// « Demain » au fuseau Europe/Paris (yyyy-mm-dd). On part du jour Paris puis +1 jour
// en arithmétique calendaire (UTC, sans instant) pour franchir proprement les mois.
function demainParisISO(): string {
  const [y, m, d] = partiesParis(new Date()).iso.split("-").map(Number);
  const t = new Date(Date.UTC(y, m - 1, d + 1));
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${t.getUTCFullYear()}-${pad(t.getUTCMonth() + 1)}-${pad(t.getUTCDate())}`;
}

// GET — historique des décalages (ADMIN only, fail-closed). Jamais exposé au coach.
export async function GET(request: Request, { params }: Ctx) {
  const { id } = await params;
  if (!isAdminRequest(request)) return NextResponse.json({ error: "Non autorisé." }, { status: 401 });
  if (!isSupabaseConfigured()) return NextResponse.json({ error: "Supabase non configuré." }, { status: 503 });
  const supabase = getSupabaseAdmin();
  // Tolérant si la migration 021 n'est pas encore appliquée → historique vide.
  const res = await supabase
    .from("decalages_echeances")
    .select("id, created_at, motif, avant, apres")
    .eq("adherent_id", id)
    .order("created_at", { ascending: false });
  if (res.error) return NextResponse.json({ decalages: [] });
  return NextResponse.json({ decalages: res.data ?? [] });
}

// POST — décaler les échéances non encaissées. { actionId, motif, mode, mois?, dates? }
// Route protégée, fail-closed. Le serveur a le dernier mot sur toutes les dates.
export async function POST(request: Request, { params }: Ctx) {
  const { id } = await params;
  if (!isAdminRequest(request)) return NextResponse.json({ error: "Non autorisé." }, { status: 401 });
  if (!isSupabaseConfigured()) return NextResponse.json({ error: "Supabase non configuré." }, { status: 503 });

  let body: { actionId?: string; motif?: string; mode?: "tout" | "dates"; mois?: number; dates?: Record<string, string> };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Corps invalide." }, { status: 400 });
  }
  const actionId = String(body.actionId || "").trim();
  if (!actionId) return NextResponse.json({ error: "actionId requis." }, { status: 400 });
  const motif = String(body.motif || "").trim();
  if (!motif) return NextResponse.json({ error: "Un motif court est requis." }, { status: 400 });
  if (motif.length > 80) return NextResponse.json({ error: "Motif trop long (80 caractères maximum)." }, { status: 400 });
  const mode = body.mode === "dates" ? "dates" : "tout";

  const supabase = getSupabaseAdmin();
  const r = await decalerEcheances(supabase, {
    adherentId: id,
    actionId,
    motif,
    mode,
    mois: body.mois,
    dates: body.dates,
    demainISO: demainParisISO(),
  });
  if (!r.ok) return NextResponse.json({ error: r.error }, { status: r.status });
  return NextResponse.json({ ok: true, dejaTraite: !!r.dejaTraite, deplacees: r.deplacees, refusees: r.refusees, aVerifier: r.aVerifier, calendrier: r.calendrier });
}
