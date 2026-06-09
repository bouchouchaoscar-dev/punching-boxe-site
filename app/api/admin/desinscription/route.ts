import { NextResponse } from "next/server";
import { getSupabaseAdmin, isSupabaseConfigured } from "@/lib/supabase";
import { isAdminRequest } from "@/lib/admin-guard";

export const runtime = "nodejs";

// GET — un email est-il désinscrit du marketing ? (avertissement avant un mail
// individuel ; ne bloque pas l'envoi, c'est l'admin qui décide).
export async function GET(request: Request) {
  if (!isAdminRequest(request)) {
    return NextResponse.json({ error: "Non autorisé." }, { status: 401 });
  }
  if (!isSupabaseConfigured()) return NextResponse.json({ desinscrit: false });

  const email = (new URL(request.url).searchParams.get("email") || "")
    .trim()
    .toLowerCase();
  if (!email) return NextResponse.json({ desinscrit: false });

  const supabase = getSupabaseAdmin();
  const { data } = await supabase
    .from("desinscriptions_mailing")
    .select("email")
    .eq("email", email)
    .maybeSingle();
  return NextResponse.json({ desinscrit: !!data });
}
