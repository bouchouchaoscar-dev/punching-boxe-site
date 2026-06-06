import { NextResponse } from "next/server";
import { getSupabaseAdmin, isSupabaseConfigured } from "@/lib/supabase";
import { isAdminRequest } from "@/lib/admin-guard";

export const runtime = "nodejs";

// GET — nombre de contacts importés.
export async function GET(request: Request) {
  if (!isAdminRequest(request)) {
    return NextResponse.json({ error: "Non autorisé." }, { status: 401 });
  }
  if (!isSupabaseConfigured()) return NextResponse.json({ count: 0 });

  const supabase = getSupabaseAdmin();
  const { count, error } = await supabase
    .from("contacts_mailing")
    .select("id", { count: "exact", head: true });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ count: count ?? 0 });
}
