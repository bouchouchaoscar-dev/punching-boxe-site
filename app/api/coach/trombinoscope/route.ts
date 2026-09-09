import { NextResponse } from "next/server";
import { isSupabaseConfigured } from "@/lib/supabase";
import { hasRole } from "@/lib/admin-guard";
import {
  chargerActifsTrombi,
  chargerPhotos,
  toMembrePublic,
} from "@/lib/trombi-server";

export const runtime = "nodejs";

// GET — trombinoscope en LECTURE SEULE pour les coachs (et l'admin).
// Renvoie UNIQUEMENT des données publiques : prenom, nom, formule, statutLabel,
// statutCouleur, photo/initiales (+ type, package, statutCode NON sensibles pour
// les filtres). AUCUN email, téléphone, adresse, montant, date de naissance, id.
export async function GET(request: Request) {
  // Accès coach OU admin. FAIL CLOSED sinon.
  if (!hasRole(request, ["coach", "admin"])) {
    return NextResponse.json({ error: "Accès refusé." }, { status: 401 });
  }
  if (!isSupabaseConfigured()) {
    return NextResponse.json({ membres: [] });
  }

  const { searchParams } = new URL(request.url);
  const saison = searchParams.get("saison") || "";

  const actifs = await chargerActifsTrombi({ saison });
  const photos = await chargerPhotos(actifs);
  const membres = actifs.map((a, i) => toMembrePublic(a, photos[i]));

  return NextResponse.json(
    { membres },
    { headers: { "Cache-Control": "no-store" } },
  );
}
