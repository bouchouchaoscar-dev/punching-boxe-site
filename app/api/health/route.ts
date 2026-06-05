import { NextResponse } from "next/server";
import { getSupabaseAdmin, isSupabaseConfigured } from "@/lib/supabase";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Health check + keep-alive Supabase : effectue un vrai accès base (count des
 * adhérents) pour empêcher la mise en veille du projet Supabase (free tier).
 */
export async function GET() {
  const timestamp = new Date().toISOString();

  if (!isSupabaseConfigured()) {
    return NextResponse.json(
      { status: "degraded", db: "non configuré", timestamp },
      { status: 200 },
    );
  }

  try {
    const supabase = getSupabaseAdmin();
    const { count, error } = await supabase
      .from("adherents")
      .select("id", { count: "exact", head: true });
    if (error) {
      return NextResponse.json(
        { status: "error", db: "down", error: error.message, timestamp },
        { status: 503 },
      );
    }
    return NextResponse.json({
      status: "ok",
      db: "up",
      adherents: count ?? 0,
      timestamp,
    });
  } catch (e) {
    return NextResponse.json(
      {
        status: "error",
        error: e instanceof Error ? e.message : "Erreur inconnue",
        timestamp,
      },
      { status: 503 },
    );
  }
}
