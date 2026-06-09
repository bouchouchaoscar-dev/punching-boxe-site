import { NextResponse } from "next/server";
import { getSupabaseAdmin, isSupabaseConfigured } from "@/lib/supabase";
import { isAdminRequest } from "@/lib/admin-guard";
import { saisonCourante } from "@/lib/saison";

export const runtime = "nodejs";

// GET — liste des saisons connues (historique importé ∪ natifs ∪ saison courante),
// pour étendre le sélecteur de saison du back-office. Léger (distinct).
export async function GET(request: Request) {
  if (!isAdminRequest(request)) {
    return NextResponse.json({ error: "Non autorisé." }, { status: 401 });
  }
  if (!isSupabaseConfigured()) return NextResponse.json({ seasons: [] });

  const supabase = getSupabaseAdmin();
  const set = new Set<string>([saisonCourante(new Date())]);

  // Pagination simple (distinct côté app, volumes faibles).
  for (const table of ["historique_saisons", "adherents"]) {
    let from = 0;
    for (;;) {
      const { data } = await supabase.from(table).select("saison").range(from, from + 999);
      if (!data || !data.length) break;
      for (const r of data) if (r.saison) set.add(r.saison as string);
      if (data.length < 1000) break;
      from += 1000;
    }
  }

  return NextResponse.json({ seasons: [...set].sort().reverse() });
}
