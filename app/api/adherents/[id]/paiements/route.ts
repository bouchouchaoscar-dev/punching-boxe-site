import { NextResponse } from "next/server";
import { getSupabaseAdmin, isSupabaseConfigured } from "@/lib/supabase";
import { isStripeConfigured } from "@/lib/stripe";
import { chargerEcheance } from "@/lib/payments";
import { familleEchec } from "@/lib/stripe-erreurs";

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

// POST — retente le prélèvement d'une échéance en ÉCHEC ou DUE (date prévue
// atteinte). Ne prélève JAMAIS une échéance future en avance.
export async function POST(_req: Request, { params }: Ctx) {
  const { id } = await params;
  if (!isStripeConfigured() || !isSupabaseConfigured()) {
    return NextResponse.json({ error: "Non configuré." }, { status: 503 });
  }
  const supabase = getSupabaseAdmin();

  // Carte invalide (carte morte) : retenter la même carte échouera, c'est à
  // l'adhérent de régulariser avec une nouvelle carte.
  const { data: adh } = await supabase
    .from("adherents")
    .select("derniere_erreur_code")
    .eq("id", id)
    .single();
  if (familleEchec(adh?.derniere_erreur_code) === "carte_morte") {
    return NextResponse.json(
      {
        error:
          "Carte invalide : l'adhérent doit régulariser lui-même avec une nouvelle carte.",
      },
      { status: 409 },
    );
  }

  // Échéances non réglées, échec d'abord puis par numéro.
  const today = new Date().toISOString().slice(0, 10);
  const { data: rows } = await supabase
    .from("paiements")
    .select("id, statut, numero_echeance, date_prevue")
    .eq("adherent_id", id)
    .neq("statut", "paye")
    .not("numero_echeance", "is", null)
    .order("numero_echeance", { ascending: true });

  // Cible = en échec, OU en attente dont la date prévue est atteinte. Jamais future.
  const cible = (rows ?? []).find(
    (r) =>
      r.statut === "echec" ||
      (r.statut === "en_attente" && (r.date_prevue ?? "") <= today),
  );
  if (!cible) {
    return NextResponse.json(
      { error: "Aucune échéance due à retenter." },
      { status: 404 },
    );
  }

  // On réinitialise pour forcer un nouveau PaymentIntent.
  await supabase
    .from("paiements")
    .update({ statut: "en_attente", stripe_payment_intent_id: null })
    .eq("id", cible.id);

  const res = await chargerEcheance(cible.id);
  return NextResponse.json(res, { status: res.ok ? 200 : 502 });
}
