import { NextResponse } from "next/server";
import { getSupabaseAdmin, isSupabaseConfigured } from "@/lib/supabase";
import { getAuthUser } from "@/lib/auth-server";
import {
  analyserFoyer,
  resoudreMembre,
  rattachementsRenseignes,
  type RattachementInput,
} from "@/lib/foyer-server";

export const runtime = "nodejs";

// POST — prévisualisation du rattachement famille (aperçu de remise côté client).
// Renvoie, par membre cité, un simple statut (trouvé / ambigu / introuvable) SANS
// aucune donnée personnelle, et le nombre de membres actuellement comptés dans le
// foyer projeté (pour estimer la remise). Le calcul fait foi côté serveur à la
// création ; ceci n'écrit RIEN.
export async function POST(request: Request) {
  if (!isSupabaseConfigured()) {
    return NextResponse.json({ ok: false, membres: [], nbMembresActuels: 0 });
  }
  const user = await getAuthUser(request);
  if (!user) {
    return NextResponse.json({ error: "Connexion requise." }, { status: 401 });
  }

  let body: { membres?: RattachementInput[] };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Corps invalide." }, { status: 400 });
  }

  const supabase = getSupabaseAdmin();
  const rats = rattachementsRenseignes(body.membres);

  // Statut par membre (booléens uniquement, pas de PII renvoyée).
  const membres = await Promise.all(
    rats.map(async (m) => {
      const r = await resoudreMembre(supabase, m);
      return {
        trouve: r.etat === "ok",
        ambigu: r.etat === "ambigu",
        ferme: r.etat === "ferme",
      };
    }),
  );

  const analyse = await analyserFoyer(supabase, {
    titulaireId: user.id,
    rattachements: rats,
    newId: crypto.randomUUID(),
  });

  return NextResponse.json({
    ok: analyse.ok,
    raison: analyse.ok ? null : analyse.raison,
    membres,
    // Membres déjà comptés dans le foyer (le nouveau sera le rang +1).
    nbMembresActuels: analyse.ok ? analyse.nbMembres : null,
    // Noms des membres du foyer du titulaire CONNECTÉ (sa propre famille) →
    // confirmation visuelle « c'est bien mon foyer ». Pas de PII de tiers.
    membresNoms: analyse.ok ? analyse.membresNoms : [],
  });
}
