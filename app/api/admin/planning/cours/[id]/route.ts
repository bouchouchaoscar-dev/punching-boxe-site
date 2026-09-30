import { NextResponse } from "next/server";
import { getSupabaseAdmin, isSupabaseConfigured } from "@/lib/supabase";
import { isAdminRequest } from "@/lib/admin-guard";
import { planningActif, lundiDeLaSemaine, toISODate, MSG_HISTORIQUE_COURS, MSG_PRESENCES_COURS } from "@/lib/planning";

export const runtime = "nodejs";

type Ctx = { params: Promise<{ id: string }> };

// DELETE — supprimer un cours. BLOQUÉ (409) s'il a des affectations sur une
// semaine passée ou en cours (historique des heures profs, utile aux stats).
// Autorisé si seules des affectations FUTURES existent (elles partent en cascade).
export async function DELETE(request: Request, { params }: Ctx) {
  if (!planningActif()) return NextResponse.json({ error: "Module désactivé." }, { status: 404 });
  if (!isAdminRequest(request)) return NextResponse.json({ error: "Non autorisé." }, { status: 401 });
  if (!isSupabaseConfigured()) return NextResponse.json({ error: "Supabase non configuré." }, { status: 503 });

  const { id } = await params;
  if (!id) return NextResponse.json({ error: "Identifiant requis." }, { status: 400 });

  const supabase = getSupabaseAdmin();
  const lundiCourant = toISODate(lundiDeLaSemaine(new Date()));
  const { count } = await supabase
    .from("affectations")
    .select("id", { count: "exact", head: true })
    .eq("cours_id", id)
    .lte("semaine", lundiCourant); // passé ou semaine en cours
  if (count && count > 0) {
    return NextResponse.json({ error: MSG_HISTORIQUE_COURS, code: "historique" }, { status: 409 });
  }

  // Présences enregistrées (module Présence) → même blocage 409 + Désactiver.
  const { count: nbPresences } = await supabase
    .from("presences")
    .select("id", { count: "exact", head: true })
    .eq("cours_id", id);
  if (nbPresences && nbPresences > 0) {
    return NextResponse.json({ error: MSG_PRESENCES_COURS, code: "presences" }, { status: 409 });
  }

  const { error } = await supabase.from("cours").delete().eq("id", id);
  if (error) {
    // Filet de sécurité : FK ON DELETE RESTRICT (présences) → 23503 traduit en
    // 409 lisible plutôt qu'une 500 technique.
    if (error.code === "23503") {
      return NextResponse.json({ error: MSG_PRESENCES_COURS, code: "presences" }, { status: 409 });
    }
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ success: true });
}
