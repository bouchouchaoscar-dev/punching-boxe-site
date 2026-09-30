import { NextResponse } from "next/server";
import { getSupabaseAdmin, isSupabaseConfigured } from "@/lib/supabase";
import { CONFIG_CLUB } from "@/lib/config-club";
import { presenceActif, partiesParis } from "@/lib/presence";
import { dossiersSaison, trouverDossierCorrespondant } from "@/lib/presence-server";
import { saisonCourante } from "@/lib/saison";
import { estMineur } from "@/lib/pricing";
import { normaliserEmail } from "@/lib/email-format";
import { sendRelanceEssai } from "@/lib/email";
import type { SupabaseClient } from "@supabase/supabase-js";

export const runtime = "nodejs";

type Essai = {
  id: string;
  prenom: string | null;
  nom: string | null;
  date_naissance: string | null;
  email: string | null;
  cours_id: string | null;
  date_seance: string;
  created_at: string;
  relance_1_at: string | null;
  relance_2_at: string | null;
  desinscrit: boolean;
  converti_dossier_id: string | null;
};

// Emails à exclure de tout envoi (désinscrits RGPD + adresses bouncées).
async function chargerExclusions(supabase: SupabaseClient): Promise<Set<string>> {
  const [{ data: opt }, { data: bnc }] = await Promise.all([
    supabase.from("desinscriptions_mailing").select("email"),
    supabase.from("emails_bounced").select("email"),
  ]);
  return new Set([
    ...(opt ?? []).map((o) => normaliserEmail(o.email as string)),
    ...(bnc ?? []).map((b) => normaliserEmail(b.email as string)),
  ]);
}

// GET /api/cron/presence — relances d'essai (J+1 / J+7) + purge RGPD.
// Auth : Bearer CRON_SECRET (ou header interne Vercel). No-op si module inactif.
export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  const auth = request.headers.get("authorization");
  const isVercelCron = request.headers.get("x-vercel-cron") !== null;
  if (secret && auth !== `Bearer ${secret}` && !isVercelCron) {
    return NextResponse.json({ error: "Non autorisé." }, { status: 401 });
  }
  if (!presenceActif()) return NextResponse.json({ ok: true, skipped: "module inactif" });
  if (!isSupabaseConfigured()) return NextResponse.json({ ok: true, skipped: "supabase" });

  const supabase = getSupabaseAdmin();
  const cfg = CONFIG_CLUB.modules.presence;
  // Timing basé sur la DATE DE SÉANCE (heure de Paris), pas sur created_at :
  // relance 1 = dès le lendemain (date_seance + 1 j) ; relance 2 = date_seance +
  // N jours. Au premier passage du cron ce jour-là, quelle que soit l'heure de la
  // séance. On compare des dates (YYYY-MM-DD).
  const ajoutJours = (iso: string, n: number) => {
    const [y, m, d] = iso.split("-").map(Number);
    const dt = new Date(Date.UTC(y, m - 1, d + n));
    return dt.toISOString().slice(0, 10);
  };
  const aujourdhui = partiesParis(new Date()).iso;
  const seuilRelance1 = ajoutJours(aujourdhui, -1); // date_seance <= hier
  const seuilRelance2 = ajoutJours(aujourdhui, -cfg.relancesEssai.secondeJours);

  const [exclusions, dossiers, { data: coursRows }] = await Promise.all([
    chargerExclusions(supabase),
    dossiersSaison(supabase, saisonCourante(new Date())),
    supabase.from("cours").select("id, libelle"),
  ]);
  const labelCours = new Map((coursRows ?? []).map((c) => [c.id as string, (c.libelle as string) ?? null]));

  let envoyes1 = 0;
  let envoyes2 = 0;
  let convertis = 0;

  // Un essai converti entre-temps (email/triplet = dossier saison) → on lie et on
  // n'envoie pas. Renvoie true si converti.
  async function marquerSiConverti(e: Essai): Promise<boolean> {
    const d = trouverDossierCorrespondant(dossiers, {
      email: e.email,
      nom: e.nom,
      prenom: e.prenom,
      date_naissance: e.date_naissance,
    });
    if (!d) return false;
    await supabase.from("essais").update({ converti_dossier_id: d.id }).eq("id", e.id);
    convertis++;
    return true;
  }

  async function passer(numero: 1 | 2): Promise<void> {
    const colClaim = numero === 1 ? "relance_1_at" : "relance_2_at";
    let q = supabase
      .from("essais")
      .select("*")
      .is(colClaim, null)
      .eq("desinscrit", false)
      .is("converti_dossier_id", null);
    q =
      numero === 1
        ? q.lte("date_seance", seuilRelance1)
        : q.not("relance_1_at", "is", null).lte("date_seance", seuilRelance2);
    const { data } = await q;
    for (const e of (data ?? []) as Essai[]) {
      // Claim atomique : seul le premier passage gagne la mise à jour.
      const { data: claimed } = await supabase
        .from("essais")
        .update({ [colClaim]: new Date().toISOString() })
        .eq("id", e.id)
        .is(colClaim, null)
        .select("id")
        .maybeSingle();
      if (!claimed) continue; // claim perdu

      if (await marquerSiConverti(e)) continue; // inscrit entre-temps → stop
      const email = normaliserEmail(e.email);
      if (!email || exclusions.has(email)) continue; // bounce / désinscrit

      await sendRelanceEssai({
        email,
        prenom: e.prenom ?? "",
        mineur: estMineur(e.date_naissance),
        coursLabel: e.cours_id ? labelCours.get(e.cours_id) ?? null : null,
        numero,
      });
      if (numero === 1) envoyes1++;
      else envoyes2++;
    }
  }

  await passer(1);
  await passer(2);

  // ---- Purge RGPD : présences + essais non convertis hors fenêtre de conservation.
  const anneeDebut = Number(saisonCourante(new Date()).split("-")[0]);
  const cutoff = `${anneeDebut - cfg.conservationSaisons}-09-01`; // début de la 1re saison purgée
  const { count: presPurgees } = await supabase
    .from("presences")
    .delete({ count: "exact" })
    .lt("date_seance", cutoff);
  const { count: essaisPurges } = await supabase
    .from("essais")
    .delete({ count: "exact" })
    .lt("created_at", `${cutoff}T00:00:00Z`)
    .is("converti_dossier_id", null);

  return NextResponse.json({
    ok: true,
    relance1: envoyes1,
    relance2: envoyes2,
    convertis,
    purge: { presences: presPurgees ?? 0, essais: essaisPurges ?? 0, cutoff },
  });
}
