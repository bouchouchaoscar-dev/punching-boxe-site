import { NextResponse } from "next/server";
import { getStripe, isStripeConfigured } from "@/lib/stripe";
import { getSupabaseAdmin, isSupabaseConfigured } from "@/lib/supabase";
import { isAdminRequest } from "@/lib/admin-guard";
import { annulerEcheances, allouerRemboursement } from "@/lib/payments";

export const runtime = "nodejs";

type Ctx = { params: Promise<{ id: string }> };
type Mode = "refund_keep" | "refund_stop" | "refund_all" | "stop_only";
const MODES: Mode[] = ["refund_keep", "refund_stop", "refund_all", "stop_only"];

const cents = (n: number) => Math.round(Number(n) * 100);
const round2 = (n: number) => Math.round(n * 100) / 100;

// POST — panneau « Gérer le paiement ». Rembourse (montant libre / intégral) et/ou
// stoppe les échéances. Argent réel → garde-fous : idempotence par actionId
// (table remboursements en clé primaire) + plafond serveur + clés d'idempotence
// Stripe par échéance + ordre STOP puis REFUND.
export async function POST(request: Request, { params }: Ctx) {
  const { id } = await params;
  if (!isAdminRequest(request)) {
    return NextResponse.json({ error: "Non autorisé." }, { status: 401 });
  }
  if (!isSupabaseConfigured()) {
    return NextResponse.json({ error: "Supabase non configuré." }, { status: 503 });
  }

  let body: { actionId?: string; mode?: Mode; montant?: number };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Corps invalide." }, { status: 400 });
  }
  const actionId = String(body.actionId || "").trim();
  const mode = body.mode as Mode;
  if (!actionId) {
    return NextResponse.json({ error: "actionId requis." }, { status: 400 });
  }
  if (!MODES.includes(mode)) {
    return NextResponse.json({ error: "Mode invalide." }, { status: 400 });
  }

  const supabase = getSupabaseAdmin();

  // --- Idempotence (ceinture n°1) : l'actionId est la clé primaire. Si la ligne
  // existe déjà (double-clic / retry), on NE rejoue PAS : on renvoie l'état connu.
  const { data: existing } = await supabase
    .from("remboursements")
    .select("*")
    .eq("id", actionId)
    .maybeSingle();
  if (existing) {
    return NextResponse.json({
      success: existing.statut === "fait",
      dejaTraite: true,
      remboursement: existing,
    });
  }
  const { error: claimErr } = await supabase.from("remboursements").insert({
    id: actionId,
    adherent_id: id,
    mode,
    montant_demande: body.montant ?? null,
    statut: "en_cours",
  });
  if (claimErr) {
    // Course : une autre requête a inséré le même actionId entre-temps.
    const { data: now } = await supabase
      .from("remboursements")
      .select("*")
      .eq("id", actionId)
      .maybeSingle();
    return NextResponse.json({
      success: now?.statut === "fait",
      dejaTraite: true,
      remboursement: now,
    });
  }

  const fail = async (status: number, error: string) => {
    await supabase
      .from("remboursements")
      .update({ statut: "erreur", detail: { error }, finished_at: new Date().toISOString() })
      .eq("id", actionId);
    return NextResponse.json({ error }, { status });
  };

  try {
    const { data: adherent } = await supabase
      .from("adherents")
      .select("id, mode_paiement")
      .eq("id", id)
      .maybeSingle();
    if (!adherent) return await fail(404, "Dossier introuvable.");

    const needRefund = mode !== "stop_only";
    if (needRefund && !isStripeConfigured()) {
      return await fail(503, "Paiement en ligne non configuré.");
    }

    // Échéances PAYÉES avec une charge Stripe → remboursable = montant - déjà remboursé.
    const { data: echRows } = await supabase
      .from("paiements")
      .select("id, montant, montant_rembourse, stripe_payment_intent_id, numero_echeance")
      .eq("adherent_id", id)
      .eq("statut", "paye");
    const payees = (echRows ?? [])
      .filter((e) => e.stripe_payment_intent_id)
      .map((e) => ({
        ...e,
        remb: round2(Number(e.montant || 0) - Number(e.montant_rembourse || 0)),
      }))
      .filter((e) => e.remb > 0);
    const remboursableTotal = round2(payees.reduce((s, e) => s + e.remb, 0));

    // Montant cible (serveur autoritaire, plafonné).
    let cible = 0;
    if (mode === "refund_all") {
      cible = remboursableTotal;
    } else if (mode === "refund_keep" || mode === "refund_stop") {
      cible = round2(Number(body.montant || 0));
      if (!(cible > 0)) return await fail(400, "Montant à rembourser invalide.");
      if (cents(cible) > cents(remboursableTotal)) {
        return await fail(
          400,
          `Montant supérieur au remboursable (max ${remboursableTotal} €).`,
        );
      }
    }

    // --- ORDRE : STOP d'abord (modes 2/3/4), puis REFUND. ---
    const doStop = mode !== "refund_keep";
    let echeancesAnnulees = 0;
    if (doStop) {
      const r = await annulerEcheances(supabase, id);
      echeancesAnnulees = r.annulees;
    }

    // --- REFUND : allocation centimes, de la plus récente à la plus ancienne. ---
    const refunds: { paiementId: string; montant: number; refundId: string }[] = [];
    if (cible > 0) {
      const stripe = getStripe();
      const byId = new Map(payees.map((e) => [e.id, e]));
      const allocation = allouerRemboursement(payees, cents(cible));
      for (const { id: pid, part } of allocation) {
        const e = byId.get(pid)!;
        const refund = await stripe.refunds.create(
          { payment_intent: e.stripe_payment_intent_id as string, amount: part },
          { idempotencyKey: `rb-${actionId}-${e.id}` }, // ceinture n°2
        );
        const nouveauRemb = round2(Number(e.montant_rembourse || 0) + part / 100);
        const fully = cents(nouveauRemb) >= cents(Number(e.montant || 0));
        await supabase
          .from("paiements")
          .update({ montant_rembourse: nouveauRemb, ...(fully ? { statut: "rembourse" } : {}) })
          .eq("id", e.id);
        refunds.push({ paiementId: e.id, montant: part / 100, refundId: refund.id });
      }
    }

    // Cumul dossier (recalcul = idempotent ; le webreflet N1 convergera).
    const { data: allP } = await supabase
      .from("paiements")
      .select("montant_rembourse")
      .eq("adherent_id", id);
    const totalRemb = round2(
      (allP ?? []).reduce((s, r) => s + Number(r.montant_rembourse || 0), 0),
    );
    await supabase
      .from("adherents")
      .update({
        montant_rembourse: totalRemb,
        rembourse_at: totalRemb > 0 ? new Date().toISOString() : null,
      })
      .eq("id", id);

    const montantEffectif = round2(refunds.reduce((s, r) => s + r.montant, 0));
    await supabase
      .from("remboursements")
      .update({
        statut: "fait",
        montant_effectif: montantEffectif,
        detail: { mode, refunds, echeancesAnnulees },
        finished_at: new Date().toISOString(),
      })
      .eq("id", actionId);

    return NextResponse.json({
      success: true,
      montantRembourse: montantEffectif,
      echeancesAnnulees,
      remboursableRestant: round2(remboursableTotal - montantEffectif),
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Erreur lors du remboursement.";
    return await fail(500, msg);
  }
}
