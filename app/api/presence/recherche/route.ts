import { NextResponse } from "next/server";
import { getSupabaseAdmin, isSupabaseConfigured } from "@/lib/supabase";
import { presenceActif, chercherAdherentsPublic } from "@/lib/presence";
import { dossiersSaison } from "@/lib/presence-server";
import { saisonCourante } from "@/lib/saison";
import { autoriser, ipDe } from "@/lib/rate-limit";

export const runtime = "nodejs";

// GET /api/presence/recherche?q=<terme> — recherche publique liste blanche.
// Minimum 3 caractères (aussi côté serveur), 8 résultats max, aucun champ
// sensible (email/téléphone/photo/statut/date complète).
export async function GET(request: Request) {
  if (!presenceActif()) return NextResponse.json({ error: "Module désactivé." }, { status: 404 });
  if (!autoriser(`pres-search:${ipDe(request)}`, 120, 60_000))
    return NextResponse.json({ error: "Trop de requêtes." }, { status: 429 });
  if (!isSupabaseConfigured()) return NextResponse.json({ resultats: [] });

  const q = (new URL(request.url).searchParams.get("q") || "").trim();
  if (q.length < 3) return NextResponse.json({ resultats: [] });

  const supabase = getSupabaseAdmin();
  const dossiers = await dossiersSaison(supabase, saisonCourante(new Date()));
  const resultats = chercherAdherentsPublic(
    dossiers.map((d) => ({ id: d.id, prenom: d.prenom, nom: d.nom, date_naissance: d.date_naissance })),
    q,
  );
  return NextResponse.json({ resultats }, { headers: { "Cache-Control": "no-store" } });
}
