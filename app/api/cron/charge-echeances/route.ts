import { NextResponse } from "next/server";
import { getSupabaseAdmin, isSupabaseConfigured } from "@/lib/supabase";
import { isStripeConfigured } from "@/lib/stripe";
import { chargerEcheance } from "@/lib/payments";

export const runtime = "nodejs";

/**
 * Job quotidien (Vercel Cron) : prélève les échéances dont la date prévue est
 * atteinte et qui n'ont pas encore été prélevées.
 * Sécurisé par CRON_SECRET (ou l'en-tête Vercel `x-vercel-cron`).
 */
export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  const auth = request.headers.get("authorization");
  const isVercelCron = request.headers.get("x-vercel-cron") !== null;
  if (secret && auth !== `Bearer ${secret}` && !isVercelCron) {
    return NextResponse.json({ error: "Non autorisé." }, { status: 401 });
  }
  if (!isStripeConfigured() || !isSupabaseConfigured()) {
    return NextResponse.json({ error: "Non configuré." }, { status: 503 });
  }

  const supabase = getSupabaseAdmin();
  const today = new Date().toISOString().slice(0, 10);

  // Échéances dues, non encore prélevées (pas de PaymentIntent). On inclut aussi
  // 'en_cours' = claim resté bloqué par un run précédent interrompu : la reprise
  // est sûre grâce à la clé d'idempotence (cf. chargerEcheance) → pas de
  // double-débit. (Un débit réussi serait 'paye', un échec 'echec' → exclus.)
  const { data: dues, error } = await supabase
    .from("paiements")
    .select("id")
    .in("statut", ["en_attente", "en_cours"])
    .not("numero_echeance", "is", null)
    .is("stripe_payment_intent_id", null)
    .lte("date_prevue", today);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const results: { id: string; ok: boolean; status?: string; error?: string }[] = [];
  for (const p of dues ?? []) {
    const r = await chargerEcheance(p.id);
    results.push({ id: p.id, ...r });
  }

  return NextResponse.json({ traitees: results.length, results });
}
