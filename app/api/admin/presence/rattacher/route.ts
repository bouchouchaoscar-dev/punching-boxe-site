import { NextResponse } from "next/server";
import { getSupabaseAdmin, isSupabaseConfigured, exigerData } from "@/lib/supabase";
import { isAdminRequest } from "@/lib/admin-guard";

export const runtime = "nodejs";

// POST /api/admin/presence/rattacher — rattache (ou détache) manuellement un essai
// à un dossier adhérent (filet humain : fautes de frappe sur le nom). Admin only,
// fail-closed. Ne stocke QUE le lien converti_dossier_id (le statut reste dérivé).
//   { essaiId, dossierId }         → rattache
//   { essaiId, detacher: true }    → détache
export async function POST(request: Request) {
  if (!isAdminRequest(request)) return NextResponse.json({ error: "Non autorisé." }, { status: 401 });
  if (!isSupabaseConfigured()) return NextResponse.json({ error: "Supabase non configuré." }, { status: 503 });

  let body: { essaiId?: string; dossierId?: string; detacher?: boolean };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Corps invalide." }, { status: 400 });
  }
  const essaiId = String(body.essaiId || "").trim();
  if (!essaiId) return NextResponse.json({ error: "essaiId requis." }, { status: 400 });

  const supabase = getSupabaseAdmin();

  if (body.detacher) {
    const { error } = await supabase.from("essais").update({ converti_dossier_id: null }).eq("id", essaiId);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true, detache: true });
  }

  const dossierId = String(body.dossierId || "").trim();
  if (!dossierId) return NextResponse.json({ error: "dossierId requis." }, { status: 400 });
  // Le dossier doit exister (fail-closed).
  const dossier = exigerData(
    await supabase.from("adherents").select("id").eq("id", dossierId).maybeSingle(),
    "rattacher: lecture dossier",
  );
  if (!dossier) return NextResponse.json({ error: "Dossier introuvable." }, { status: 404 });

  const { error } = await supabase.from("essais").update({ converti_dossier_id: dossierId }).eq("id", essaiId);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, dossierId });
}
