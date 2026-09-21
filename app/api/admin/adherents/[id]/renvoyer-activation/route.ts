import { NextResponse } from "next/server";
import { getSupabaseAdmin, isSupabaseConfigured } from "@/lib/supabase";
import { isAdminRequest } from "@/lib/admin-guard";
import { envoyerLienActivation } from "@/lib/activation";
import type { Adherent } from "@/lib/types";

export const runtime = "nodejs";

type Ctx = { params: Promise<{ id: string }> };

// POST — RENVOYER le lien d'activation (définition du mot de passe) à l'adhérent.
// Régénère un lien 'recovery' FRAIS pour le compte EXISTANT (helper partagé
// envoyerLienActivation) et le renvoie par mail. NE recrée NI compte NI dossier
// (l'anti-doublon n'est jamais contourné). Renvoi multiple autorisé (idempotence
// douce) : renvoie la date de cet envoi pour affichage côté fiche.
export async function POST(request: Request, { params }: Ctx) {
  if (!isAdminRequest(request)) {
    return NextResponse.json({ error: "Non autorisé." }, { status: 401 });
  }
  const { id } = await params;
  if (!isSupabaseConfigured()) {
    return NextResponse.json({ error: "Supabase non configuré." }, { status: 503 });
  }

  const supabase = getSupabaseAdmin();
  const { data } = await supabase
    .from("adherents")
    .select("prenom, email")
    .eq("id", id)
    .maybeSingle();
  if (!data) {
    return NextResponse.json({ error: "Dossier introuvable." }, { status: 404 });
  }
  const a = data as Pick<Adherent, "prenom" | "email">;
  if (!a.email) {
    return NextResponse.json(
      { error: "Aucune adresse email sur ce dossier." },
      { status: 409 },
    );
  }

  const { envoye } = await envoyerLienActivation(a.email, a.prenom ?? "");
  if (!envoye) {
    return NextResponse.json(
      { error: "Envoi du lien impossible (email non configuré ?)." },
      { status: 502 },
    );
  }

  return NextResponse.json({ success: true, renvoye_at: new Date().toISOString() });
}
