import { NextResponse } from "next/server";
import { getSupabaseAdmin, isSupabaseConfigured } from "@/lib/supabase";
import { isAdminRequest } from "@/lib/admin-guard";
import { estEngage } from "@/lib/engagement";
import { TARIFS } from "@/lib/pricing";
import type { Adherent } from "@/lib/types";

export const runtime = "nodejs";

type Ctx = { params: Promise<{ id: string }> };

// POST — FILET HUMAIN : reconnaître / dé-reconnaître un dossier comme « ancien
// adhérent » (bascule nouveau_membre) quand le matching auto n'a pas reconnu la
// personne (ex. diminutif « Cathy » ≠ « Catherine »). Admin only, serveur
// AUTORITAIRE. N'agit QUE sur un dossier qui n'a RIEN encaissé et n'est PAS
// engagé → recalculer le montant ne touche à aucun argent réel. Ne modifie ni
// ancien_id ni match_a_verifier (pilotés par le matching auto).
export async function POST(request: Request, { params }: Ctx) {
  const { id } = await params;
  if (!isAdminRequest(request)) {
    return NextResponse.json({ error: "Non autorisé." }, { status: 401 });
  }
  if (!isSupabaseConfigured()) {
    return NextResponse.json({ error: "Supabase non configuré." }, { status: 503 });
  }

  const supabase = getSupabaseAdmin();
  const { data } = await supabase
    .from("adherents")
    .select("*")
    .eq("id", id)
    .maybeSingle();
  if (!data) {
    return NextResponse.json({ error: "Dossier introuvable." }, { status: 404 });
  }
  const a = data as Adherent;

  // GARDE-FOU ARGENT (autoritaire, FAIL-SAFE) : autoriser UNIQUEMENT si le
  // dossier n'a RIEN encaissé et n'est PAS engagé. En cas de doute → bloqué.
  const { data: pays } = await supabase
    .from("paiements")
    .select("statut")
    .eq("adherent_id", id);
  const argentEnJeu = (pays ?? []).some((p) =>
    ["paye", "en_cours", "rembourse"].includes(p.statut as string),
  );
  const bloque =
    a.statut_paiement !== "en_attente" || // ni payé, ni espèces confirmé, ni échec
    estEngage(a) || // ≥1 échéance / soldé / espèces confirmé
    !!a.engage_at ||
    (a.echeances_payees ?? 0) > 0 ||
    Number(a.montant_rembourse ?? 0) > 0 ||
    argentEnJeu;
  if (bloque) {
    return NextResponse.json(
      {
        error:
          "Dossier déjà payé ou engagé — pour ajuster les 30 €, utilisez la fonction de remboursement.",
      },
      { status: 409 },
    );
  }

  // Bascule + recalcul montant_total SERVEUR. Dans calculerTarif, l'adhésion est
  // un terme FORFAITAIRE additif (total = cotisation + adhesion + prepa) : on
  // flippe ce SEUL terme (± TARIFS.adhesion), ce qui est exact pour la grille,
  // le tarif libre, la prépa, la remise famille et le prorata (la cotisation
  // reste celle du dossier). On NE passe PAS par devisPourAdherent, qui
  // re-proratiserait à la date du jour et ignorerait un montant à tarif libre.
  const nouveau_membre = !a.nouveau_membre;
  const adhesionAvant = a.nouveau_membre ? TARIFS.adhesion : 0;
  const adhesionApres = nouveau_membre ? TARIFS.adhesion : 0;
  const montant_total =
    Math.round((Number(a.montant_total || 0) - adhesionAvant + adhesionApres) * 100) /
    100;
  if (montant_total < 0) {
    return NextResponse.json({ error: "Recalcul invalide." }, { status: 400 });
  }

  const { error: upErr } = await supabase
    .from("adherents")
    .update({ nouveau_membre, montant_total })
    .eq("id", id);
  if (upErr) {
    return NextResponse.json({ error: upErr.message }, { status: 500 });
  }

  return NextResponse.json({ success: true, nouveau_membre, montant_total });
}
