import { NextResponse } from "next/server";
import { getSupabaseAdmin, isSupabaseConfigured } from "@/lib/supabase";
import { verifierToken } from "@/lib/unsubscribe";

export const runtime = "nodejs";

// POST public mais protégé par le token HMAC (e + t). Pas d'authentification :
// la personne clique depuis son mail. action = "unsubscribe" | "resubscribe".
export async function POST(request: Request) {
  if (!isSupabaseConfigured()) {
    return NextResponse.json({ error: "Service indisponible." }, { status: 503 });
  }

  let body: { e?: string; t?: string; action?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Requête invalide." }, { status: 400 });
  }

  const email = verifierToken(body.e || "", body.t || "");
  if (!email) {
    return NextResponse.json({ error: "Lien invalide ou expiré." }, { status: 400 });
  }

  const supabase = getSupabaseAdmin();

  if (body.action === "resubscribe") {
    const { error } = await supabase
      .from("desinscriptions_mailing")
      .delete()
      .eq("email", email);
    if (error)
      return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true, statut: "reabonne", email });
  }

  // Par défaut : désinscription (idempotent).
  const { error } = await supabase
    .from("desinscriptions_mailing")
    .upsert({ email, source: "lien_mail" }, { onConflict: "email" });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, statut: "desinscrit", email });
}
