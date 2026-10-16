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
    // Statut des paiements liés (suppléments séparés).
    const paieIds = [...new Set(changements.map((c) => c.paiement_id).filter(Boolean))] as string[];
    const statutPaie = new Map<string, string>();
    if (paieIds.length) {
      const ps = exigerData(await supabase.from("paiements").select("id, statut").in("id", paieIds), "changements: paiements");
      for (const p of ps ?? []) statutPaie.set(p.id as string, p.statut as string);
    }
    const enrichis = changements.map((c) => ({
      ...c,
      paiement_statut: c.paiement_id ? statutPaie.get(c.paiement_id as string) ?? null : null,
    }));
    // Récap du supplément SÉPARÉ en cours (cas b non encaissé) : 'a_regler' (mode
    // non choisi par l'adhérent), espèces en attente, ou carte en attente.
    const enCours = enrichis.find(
      (c) =>
        c.statut === "actif" &&
        Number(c.montant_cents || 0) > 0 &&
        (c.mode_reglement === "a_regler" ||
          ((c.mode_reglement === "especes" || c.mode_reglement === "carte") && c.paiement_statut !== "paye")),
    );
    const supplement = enCours
      ? {
          montantEuros: Number(enCours.montant_cents) / 100,
          mode: enCours.mode_reglement as string,
          statut:
            enCours.mode_reglement === "a_regler"
              ? "a_regler"
              : enCours.mode_reglement === "especes"
                ? "especes_attente"
                : "carte_attente",
        }
      : null;
    return NextResponse.json({ changements: enrichis, supplement }, { headers: { "Cache-Control": "no-store" } });
  } catch {
    // Table 018 non migrée → vide (rien ne casse).
    return NextResponse.json({ changements: [], supplement: null }, { headers: { "Cache-Control": "no-store" } });
  }
}
