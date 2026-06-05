import { NextResponse } from "next/server";
import { getSupabaseAdmin, isSupabaseConfigured } from "@/lib/supabase";
import { isStripeConfigured } from "@/lib/stripe";
import { chargerEcheance } from "@/lib/payments";

export const runtime = "nodejs";

type Ctx = { params: Promise<{ id: string }> };

// GET — échéances d'un adhérent (tableau de paiements).
export async function GET(_req: Request, { params }: Ctx) {
  const { id } = await params;
  if (!isSupabaseConfigured()) {
    return NextResponse.json({ paiements: [] });
  }
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from("paiements")
    .select("*")
    .eq("adherent_id", id)
    .order("numero_echeance", { ascending: true, nullsFirst: true })
    .order("date_prevue", { ascending: true });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ paiements: data ?? [] });
}

// POST — relance le prochain prélèvement en attente / en échec.
export async function POST(_req: Request, { params }: Ctx) {
  const { id } = await params;
  if (!isStripeConfigured() || !isSupabaseConfigured()) {
    return NextResponse.json({ error: "Non configuré." }, { status: 503 });
  }
  const supabase = getSupabaseAdmin();

  // Prochaine échéance non réglée (échec d'abord, puis en attente).
  const { data: rows } = await supabase
    .from("paiements")
    .select("id, statut, numero_echeance")
    .eq("adherent_id", id)
    .neq("statut", "paye")
    .not("numero_echeance", "is", null)
    .order("numero_echeance", { ascending: true });

  const cible = (rows ?? [])[0];
  if (!cible) {
    return NextResponse.json({ error: "Aucune échéance à relancer." }, { status: 404 });
  }

  // On réinitialise pour forcer un nouveau PaymentIntent.
  await supabase
    .from("paiements")
    .update({ statut: "en_attente", stripe_payment_intent_id: null })
    .eq("id", cible.id);

  const res = await chargerEcheance(cible.id);
  return NextResponse.json(res, { status: res.ok ? 200 : 502 });
}
