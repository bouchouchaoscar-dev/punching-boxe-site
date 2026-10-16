import { NextResponse } from "next/server";
import { getSupabaseAdmin, isSupabaseConfigured, exigerData } from "@/lib/supabase";
import { isAdminRequest } from "@/lib/admin-guard";

export const runtime = "nodejs";

type Ctx = { params: Promise<{ id: string }> };

// GET /api/admin/adherents/[id]/changements-formule — historique + récap du
// supplément en cours (pour la fiche admin). `supplement` = supplément SÉPARÉ
// (cas b) non encaissé le plus récent : montant + mode + statut encaissement.
export async function GET(request: Request, { params }: Ctx) {
  const { id } = await params;
  if (!isAdminRequest(request)) return NextResponse.json({ error: "Non autorisé." }, { status: 401 });
  if (!isSupabaseConfigured()) return NextResponse.json({ changements: [], supplement: null });

  const supabase = getSupabaseAdmin();
  try {
    const rows = exigerData(
      await supabase
        .from("changements_formule")
        .select("id, ancienne_formule, nouvelle_formule, source, montant_cents, mode_reglement, statut, signe_at, signature_requise, created_by, motif, created_at, paiement_id")
        .eq("dossier_id", id)
        .order("created_at", { ascending: false }),
      "historique changements formule",
    );
    const changements = rows ?? [];
    // [020] Lignes paiements « supplément » (numéro null) avec montant + rattachement
    // (changement_id) pour SOMMER l'encaissé (versements espèces en plusieurs fois).
    const full = await supabase
      .from("paiements")
      .select("id, statut, montant, date_paiement, note, changement_id")
      .eq("adherent_id", id)
      .is("numero_echeance", null);
    const supRows: { id: string; statut: string; montant: number; date_paiement: string | null; note: string | null; changement_id: string | null }[] = full.error
      ? (((await supabase.from("paiements").select("id, statut, montant, date_paiement").eq("adherent_id", id).is("numero_echeance", null)).data ?? []) as Record<string, unknown>[]).map((p) => ({ id: p.id as string, statut: p.statut as string, montant: Number(p.montant || 0), date_paiement: (p.date_paiement as string | null) ?? null, note: null, changement_id: null }))
      : ((full.data ?? []) as Record<string, unknown>[]).map((p) => ({ id: p.id as string, statut: p.statut as string, montant: Number(p.montant || 0), date_paiement: (p.date_paiement as string | null) ?? null, note: (p.note as string | null) ?? null, changement_id: (p.changement_id as string | null) ?? null }));
    const encaisseCents = (chId: string, paiementId: string | null) => {
      let c2 = 0;
      for (const p of supRows) {
        if (p.statut !== "paye") continue;
        if (p.changement_id === chId || (p.changement_id == null && p.id === paiementId)) c2 += Math.round(p.montant * 100);
      }
      return c2;
    };
    const enrichis = changements.map((c) => {
      const duCents = Math.round(Number(c.montant_cents || 0));
      const enc = encaisseCents(c.id as string, (c.paiement_id as string | null) ?? null);
      return { ...c, encaisse_euros: enc / 100, paiement_statut: duCents > 0 && enc >= duCents ? "paye" : (c.paiement_id ? "en_attente" : null) };
    });
    // Récap du supplément SÉPARÉ en cours (cas b non soldé) : 'a_regler' (mode non
    // choisi par l'adhérent), espèces en attente, ou carte en attente.
    const enCours = enrichis.find((c) => {
      const duCents = Math.round(Number(c.montant_cents || 0));
      if (c.statut !== "actif" || duCents <= 0) return false;
      const enc = Math.round((c.encaisse_euros as number) * 100);
      if (enc >= duCents) return false; // soldé
      return c.mode_reglement === "a_regler" || c.mode_reglement === "especes" || c.mode_reglement === "carte";
    });
    const supplement = enCours
      ? {
          changementId: enCours.id as string,
          montantEuros: Number(enCours.montant_cents) / 100,
          dejaEncaisse: enCours.encaisse_euros as number,
          reste: Math.round((Number(enCours.montant_cents) / 100 - (enCours.encaisse_euros as number)) * 100) / 100,
          mode: enCours.mode_reglement as string,
          statut:
            enCours.mode_reglement === "a_regler"
              ? "a_regler"
              : enCours.mode_reglement === "especes"
                ? "especes_attente"
                : "carte_attente",
          // Versements espèces de CE supplément (date, montant, note) pour l'historique.
          versements: supRows
            .filter((p) => p.statut === "paye" && p.changement_id === enCours.id)
            .map((p) => ({ id: p.id, montant: p.montant, date: p.date_paiement, note: p.note })),
        }
      : null;
    return NextResponse.json({ changements: enrichis, supplement }, { headers: { "Cache-Control": "no-store" } });
  } catch {
    // Table 018 non migrée → vide (rien ne casse).
    return NextResponse.json({ changements: [], supplement: null }, { headers: { "Cache-Control": "no-store" } });
  }
}
