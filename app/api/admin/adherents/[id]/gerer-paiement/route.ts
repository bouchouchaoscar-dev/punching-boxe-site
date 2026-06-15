import { NextResponse } from "next/server";
import { getStripe, isStripeConfigured } from "@/lib/stripe";
import { getSupabaseAdmin, isSupabaseConfigured } from "@/lib/supabase";
import { isAdminRequest } from "@/lib/admin-guard";
import { annulerEcheances, allouerRemboursement } from "@/lib/payments";
import { sendRemboursement, sendFinInscription } from "@/lib/email";

export const runtime = "nodejs";

type Ctx = { params: Promise<{ id: string }> };
type Canal = "stripe" | "especes";

const cents = (n: number) => Math.round(Number(n) * 100);
const round2 = (n: number) => Math.round(n * 100) / 100;

// POST — « Gérer le paiement » : découple le REMBOURSEMENT (montant, carte ou
// espèces) du STATUT (fermer ou non l'inscription).
//   { actionId, montant, fermer, canal }
// Garde-fous N2 conservés : idempotence par actionId (PK), plafond serveur,
// clés d'idempotence Stripe par charge, allocation centimes, ordre STOP→REFUND.
export async function POST(request: Request, { params }: Ctx) {
  const { id } = await params;
  if (!isAdminRequest(request)) {
    return NextResponse.json({ error: "Non autorisé." }, { status: 401 });
  }
  if (!isSupabaseConfigured()) {
    return NextResponse.json({ error: "Supabase non configuré." }, { status: 503 });
  }

  let body: { actionId?: string; montant?: number; fermer?: boolean; canal?: Canal };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Corps invalide." }, { status: 400 });
  }
  const actionId = String(body.actionId || "").trim();
  if (!actionId) {
    return NextResponse.json({ error: "actionId requis." }, { status: 400 });
  }
  const fermer = !!body.fermer;
  const montant = round2(Number(body.montant || 0));
  if (montant < 0) {
    return NextResponse.json({ error: "Montant invalide." }, { status: 400 });
  }
  if (montant === 0 && !fermer) {
    return NextResponse.json(
      { error: "Aucune action : indique un montant à rembourser et/ou ferme l'inscription." },
      { status: 400 },
    );
  }

  const supabase = getSupabaseAdmin();

  // --- Idempotence (ceinture n°1) : actionId = clé primaire. Déjà traité → on
  // renvoie l'état connu, on NE rejoue PAS. ---
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
    montant_demande: montant || null,
    ferme_inscription: fermer,
    statut: "en_cours",
  });
  if (claimErr) {
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
      .select("id, email, prenom")
      .eq("id", id)
      .maybeSingle();
    if (!adherent) return await fail(404, "Dossier introuvable.");

    // Lignes encaissées (montant - déjà remboursé). Carte = avec PaymentIntent ;
    // espèces = ligne d'encaissement sans PI (créée à la confirmation espèces).
    const { data: echRows } = await supabase
      .from("paiements")
      .select("id, montant, montant_rembourse, stripe_payment_intent_id, numero_echeance")
      .eq("adherent_id", id)
      .eq("statut", "paye");
    const aRemb = (e: { montant: number; montant_rembourse: number }) =>
      round2(Number(e.montant || 0) - Number(e.montant_rembourse || 0));
    const stripeRows = (echRows ?? [])
      .filter((e) => e.stripe_payment_intent_id)
      .map((e) => ({ ...e, remb: aRemb(e) }))
      .filter((e) => e.remb > 0);
    const especesRows = (echRows ?? [])
      .filter((e) => !e.stripe_payment_intent_id)
      .map((e) => ({ ...e, remb: aRemb(e) }))
      .filter((e) => e.remb > 0);

    // Canal : fourni par le client, sinon auto (charges Stripe → carte).
    const canal: Canal =
      body.canal === "especes" || body.canal === "stripe"
        ? body.canal
        : stripeRows.length > 0
          ? "stripe"
          : "especes";
    const rows = canal === "stripe" ? stripeRows : especesRows;
    const remboursable = round2(rows.reduce((s, e) => s + e.remb, 0));

    // Plafond serveur.
    if (montant > 0 && cents(montant) > cents(remboursable)) {
      return await fail(
        400,
        `Montant supérieur au remboursable (max ${remboursable} €).`,
      );
    }
    if (montant > 0 && canal === "stripe" && !isStripeConfigured()) {
      return await fail(503, "Paiement en ligne non configuré.");
    }

    // Échéances FUTURES réellement existantes (fractionné non terminé) AVANT
    // toute action → permet au mail de ne parler de prélèvements que s'il y en
    // avait (jamais pour un paiement en 1 fois, espèces ou carte).
    const { count: futuresAvant } = await supabase
      .from("paiements")
      .select("id", { count: "exact", head: true })
      .eq("adherent_id", id)
      .in("statut", ["en_attente", "en_cours", "echec"])
      .not("numero_echeance", "is", null);
    const echeancesFutures = futuresAvant ?? 0;

    // --- ORDRE : STOP d'abord (si fermeture), puis REFUND. ---
    let echeancesAnnulees = 0;
    if (fermer) {
      const r = await annulerEcheances(supabase, id);
      echeancesAnnulees = r.annulees;
    }

    // --- REFUND : allocation centimes, plus récente → plus ancienne. ---
    const refunds: {
      paiementId: string;
      montant: number;
      refundId: string | null;
    }[] = [];
    if (montant > 0) {
      const byId = new Map(rows.map((e) => [e.id, e]));
      const allocation = allouerRemboursement(rows, cents(montant));
      const stripe = canal === "stripe" ? getStripe() : null;
      for (const { id: pid, part } of allocation) {
        const e = byId.get(pid)!;
        let refundId: string | null = null;
        if (canal === "stripe" && stripe) {
          const refund = await stripe.refunds.create(
            { payment_intent: e.stripe_payment_intent_id as string, amount: part },
            { idempotencyKey: `rb-${actionId}-${e.id}` }, // ceinture n°2
          );
          refundId = refund.id;
        }
        const nouveauRemb = round2(Number(e.montant_rembourse || 0) + part / 100);
        const fully = cents(nouveauRemb) >= cents(Number(e.montant || 0));
        await supabase
          .from("paiements")
          .update({
            montant_rembourse: nouveauRemb,
            ...(fully ? { statut: "rembourse" } : {}),
          })
          .eq("id", e.id);
        refunds.push({ paiementId: e.id, montant: part / 100, refundId });
      }
    }

    // Cumul dossier = somme des montant_rembourse (carte + espèces).
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
        canal,
        ferme_inscription: fermer,
        detail: { canal, fermer, refunds, echeancesAnnulees },
        finished_at: new Date().toISOString(),
      })
      .eq("id", actionId);

    // Email adhérent (best-effort) : remboursement (adaptatif) ou clôture seule.
    if (adherent.email) {
      try {
        if (montantEffectif > 0) {
          await sendRemboursement({
            prenom: adherent.prenom ?? "",
            email: adherent.email,
            montant: montantEffectif,
            canal,
            // Total = tout le remboursable du canal a été remboursé.
            total: cents(montantEffectif) >= cents(remboursable),
            ferme: fermer,
            echeancesFutures,
          });
        } else if (fermer) {
          await sendFinInscription({
            prenom: adherent.prenom ?? "",
            email: adherent.email,
            date: new Date().toISOString(),
          });
        }
      } catch (e) {
        console.error("Email remboursement/clôture:", e);
      }
    }

    return NextResponse.json({
      success: true,
      canal,
      montantRembourse: montantEffectif,
      ferme: fermer,
      echeancesAnnulees,
      remboursableRestant: round2(remboursable - montantEffectif),
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Erreur lors du remboursement.";
    return await fail(500, msg);
  }
}
