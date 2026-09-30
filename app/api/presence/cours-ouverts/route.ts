import { NextResponse } from "next/server";
import { getSupabaseAdmin, isSupabaseConfigured } from "@/lib/supabase";
import { presenceActif, coursOuverts } from "@/lib/presence";
import { chargerPlanning, coursPublic } from "@/lib/presence-server";
import { autoriser, ipDe } from "@/lib/rate-limit";

export const runtime = "nodejs";

// GET /api/presence/cours-ouverts?salle=<slug> — cours ouverts maintenant.
export async function GET(request: Request) {
  if (!presenceActif()) return NextResponse.json({ error: "Module désactivé." }, { status: 404 });
  if (!autoriser(`pres-cours:${ipDe(request)}`, 60, 60_000))
    return NextResponse.json({ error: "Trop de requêtes." }, { status: 429 });
  if (!isSupabaseConfigured()) return NextResponse.json({ cours: [] });

  const salle = new URL(request.url).searchParams.get("salle") || undefined;
  const supabase = getSupabaseAdmin();
  const { cours, periodes } = await chargerPlanning(supabase);
  const ouverts = coursOuverts(new Date(), { cours, periodes, salle });
  return NextResponse.json(
    { cours: ouverts.map(coursPublic) },
    { headers: { "Cache-Control": "no-store" } },
  );
}
