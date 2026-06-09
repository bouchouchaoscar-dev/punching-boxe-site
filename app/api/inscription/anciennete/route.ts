import { NextResponse } from "next/server";
import { getSupabaseAdmin, isSupabaseConfigured } from "@/lib/supabase";
import { getAuthUser } from "@/lib/auth-server";
import { estJuin, saisonCourante, saisonQuiSeTermine } from "@/lib/saison";
import { evaluerAnciennete } from "@/lib/anciennete";

export const runtime = "nodejs";

// POST — indique au formulaire si l'adhésion 30€ s'applique pour une identité.
// Auth requise (ne pas exposer l'historique d'adhésion d'autrui). Indicatif :
// le montant final reste décidé à la création du dossier.
export async function POST(request: Request) {
  if (!isSupabaseConfigured()) {
    return NextResponse.json({ error: "Indisponible." }, { status: 503 });
  }
  const user = await getAuthUser(request);
  if (!user) {
    return NextResponse.json({ error: "Connexion requise." }, { status: 401 });
  }

  let body: {
    nom?: string;
    prenom?: string;
    date_naissance?: string;
    saison_en_cours?: boolean;
  };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Corps invalide." }, { status: 400 });
  }
  if (!body.nom?.trim() || !body.prenom?.trim()) {
    return NextResponse.json({ error: "Identité incomplète." }, { status: 400 });
  }

  const now = new Date();
  const saisonEnCours = !!body.saison_en_cours && estJuin(now);
  const saisonInscription = saisonEnCours
    ? saisonQuiSeTermine(now)
    : saisonCourante(now);

  const anc = await evaluerAnciennete(
    getSupabaseAdmin(),
    {
      nom: body.nom,
      prenom: body.prenom,
      date_naissance: body.date_naissance,
    },
    saisonInscription,
  );

  return NextResponse.json({ paieAdhesion: anc.paieAdhesion, motif: anc.motif });
}
