import { NextResponse } from "next/server";
import { getSupabaseAdmin, isSupabaseConfigured } from "@/lib/supabase";
import { isAdminRequest } from "@/lib/admin-guard";
import { encaisserEspeces, cibleEncaissementEspeces } from "@/lib/payments";

export const runtime = "nodejs";

type Ctx = { params: Promise<{ id: string }> };

// GET — récap cotisation (dû / encaissé / reste) + HISTORIQUE des versements
// espèces (date, montant, note, rattachement supplément). Fail-closed admin.
export async function GET(request: Request, { params }: Ctx) {
  const { id } = await params;
  if (!isAdminRequest(request)) return NextResponse.json({ error: "Non autorisé." }, { status: 401 });
  if (!isSupabaseConfigured()) return NextResponse.json({ error: "Supabase non configuré." }, { status: 503 });

  const supabase = getSupabaseAdmin();
  const c = await cibleEncaissementEspeces(supabase, id, null);
  if (!c.ok) return NextResponse.json({ error: c.error }, { status: c.status });

  // Versements = lignes cash encaissées (numéro null, sans carte, payées).
  // Tolérant si la migration 020 (note/changement_id) n'est pas encore appliquée.
  const full = await supabase
    .from("paiements")
    .select("id, montant, date_paiement, note, changement_id")
    .eq("adherent_id", id)
    .is("numero_echeance", null)
    .is("stripe_payment_intent_id", null)
    .eq("statut", "paye")
    .order("date_paiement", { ascending: true });
  const data = full.error
    ? ((await supabase
        .from("paiements")
        .select("id, montant, date_paiement")
        .eq("adherent_id", id)
        .is("numero_echeance", null)
        .is("stripe_payment_intent_id", null)
        .eq("statut", "paye")
        .order("date_paiement", { ascending: true })).data ?? [])
    : (full.data ?? []);
  const versements = (data as Record<string, unknown>[]).map((r) => ({
    id: r.id as string,
    montant: Number(r.montant || 0),
    date: (r.date_paiement as string) ?? null,
    note: (r.note as string | null) ?? null,
    changementId: (r.changement_id as string | null) ?? null,
  }));

  return NextResponse.json({ cotisation: c.cible, versements });
}

// POST /api/admin/adherents/[id]/encaisser-especes — enregistre UN versement
// espèces (cotisation si changementId absent, sinon supplément de changement de
// formule). « Tout encaisser » = montant == reste dû. Le serveur revérifie le
// reste dû et REFUSE tout dépassement. Idempotent (versementId = clé). Fail-closed.
export async function POST(request: Request, { params }: Ctx) {
  const { id } = await params;
  if (!isAdminRequest(request)) return NextResponse.json({ error: "Non autorisé." }, { status: 401 });
  if (!isSupabaseConfigured()) return NextResponse.json({ error: "Supabase non configuré." }, { status: 503 });

  let body: { versementId?: string; montant?: number; tout?: boolean; note?: string; changementId?: string | null };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Corps invalide." }, { status: 400 });
  }
  const versementId = String(body.versementId || "").trim();
  if (!versementId) return NextResponse.json({ error: "versementId requis." }, { status: 400 });
  const tout = body.tout === true;
  const montant = Number(body.montant || 0);
  if (!tout && !(montant > 0)) return NextResponse.json({ error: "Montant requis." }, { status: 400 });

  const supabase = getSupabaseAdmin();
  const r = await encaisserEspeces(supabase, {
    adherentId: id,
    versementId,
    tout,
    montantEuros: montant,
    note: body.note ?? null,
    changementId: body.changementId ?? null,
  });
  if (!r.ok) return NextResponse.json({ error: r.error }, { status: r.status });
  return NextResponse.json({ ok: true, dejaTraite: !!r.dejaTraite, ...r.cible, solde: r.cible.reste === 0 });
}
