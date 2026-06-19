import { NextResponse } from "next/server";
import { getSupabaseAdmin, isSupabaseConfigured } from "@/lib/supabase";
import { isStripeConfigured } from "@/lib/stripe";
import { chargerEcheance } from "@/lib/payments";
import { sendRelancePanier, sendCommencerInscription } from "@/lib/email";
import {
  envoyerCampagne,
  statutCampagne,
  enregistrerEnvois,
  type RecetteCampagne,
} from "@/lib/envoi-campagne";

export const runtime = "nodejs";

/**
 * Envoie les campagnes PLANIFIÉES dont l'heure est atteinte (active, non
 * envoyée). Claim atomique (planifiee → en_cours) AVANT envoi → pas de double
 * envoi si le cron repasse. Segments recalculés au jour J (même chemin que
 * l'envoi manuel). Échec → 'erreur' sans renvoi auto.
 */
async function envoyerCampagnesPlanifiees() {
  const supabase = getSupabaseAdmin();
  const nowIso = new Date().toISOString();
  const { data: dues } = await supabase
    .from("campagnes")
    .select("id")
    .eq("statut", "planifiee")
    .eq("etat", "active")
    .lte("scheduled_at", nowIso);

  const results: { id: string; statut: string; envoyes?: number }[] = [];
  for (const c of dues ?? []) {
    // Claim : seule une exécution peut passer planifiee → en_cours.
    const { data: claimed } = await supabase
      .from("campagnes")
      .update({ statut: "en_cours" })
      .eq("id", c.id)
      .eq("statut", "planifiee")
      .eq("etat", "active")
      .select("id, objet, contenu, liste_filtre")
      .maybeSingle();
    if (!claimed) {
      results.push({ id: c.id, statut: "ignoree" });
      continue;
    }

    const recette = {
      ...(claimed.liste_filtre as RecetteCampagne),
      objet: claimed.objet as unknown as string,
      contenu: claimed.contenu as unknown as string,
    } as RecetteCampagne;

    let res;
    try {
      res = await envoyerCampagne(supabase, recette);
    } catch (e) {
      console.error("Envoi campagne planifiée:", e);
      await supabase
        .from("campagnes")
        .update({ statut: "erreur" })
        .eq("id", c.id);
      results.push({ id: c.id, statut: "erreur" });
      continue;
    }

    const statut = statutCampagne(res);
    await supabase
      .from("campagnes")
      .update({
        statut,
        envoye_at: new Date().toISOString(),
        cible: res.cible,
        nb_destinataires: res.personnesCiblees,
        nb_envoyes: res.emailsEnvoyes,
        nb_exclus: res.exclus + res.exclusSansEmail,
        destinataires_liste: res.destinatairesListe,
      })
      .eq("id", c.id);
    // Suivi par destinataire (best-effort).
    await enregistrerEnvois(supabase, c.id, res.resultats);
    results.push({ id: c.id, statut, envoyes: res.emailsEnvoyes });
  }
  return results;
}

/**
 * Job quotidien (Vercel Cron) : prélève les échéances dont la date prévue est
 * atteinte et qui n'ont pas encore été prélevées.
 * Sécurisé par CRON_SECRET (ou l'en-tête Vercel `x-vercel-cron`).
 */
export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  const auth = request.headers.get("authorization");
  const isVercelCron = request.headers.get("x-vercel-cron") !== null;
  if (secret && auth !== `Bearer ${secret}` && !isVercelCron) {
    return NextResponse.json({ error: "Non autorisé." }, { status: 401 });
  }
  if (!isStripeConfigured() || !isSupabaseConfigured()) {
    return NextResponse.json({ error: "Non configuré." }, { status: 503 });
  }

  const supabase = getSupabaseAdmin();
  const today = new Date().toISOString().slice(0, 10);

  // Échéances dues, non encore prélevées (pas de PaymentIntent). On inclut aussi
  // 'en_cours' = claim resté bloqué par un run précédent interrompu : la reprise
  // est sûre grâce à la clé d'idempotence (cf. chargerEcheance) → pas de
  // double-débit. (Un débit réussi serait 'paye', un échec 'echec' → exclus.)
  const { data: dues, error } = await supabase
    .from("paiements")
    .select("id")
    .in("statut", ["en_attente", "en_cours"])
    .not("numero_echeance", "is", null)
    .is("stripe_payment_intent_id", null)
    .lte("date_prevue", today);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const results: { id: string; ok: boolean; status?: string; error?: string }[] = [];
  for (const p of dues ?? []) {
    const r = await chargerEcheance(p.id);
    results.push({ id: p.id, ...r });
  }

  // Campagnes planifiées dont l'heure est atteinte.
  const campagnes = await envoyerCampagnesPlanifiees();

  // Relances « panier abandonné » (dossiers carte non finalisés depuis 24h+).
  const relances = await relancerPaniersAbandonnes();

  // Relances « compte sans inscription » (espace créé, aucun dossier, 24h+).
  const relancesComptes = await relancerComptesSansInscription();

  return NextResponse.json({ traitees: results.length, results, campagnes, relances, relancesComptes });
}

/**
 * Relance « compte sans inscription » : comptes Auth créés depuis plus de 24h
 * qui n'ont AUCUN dossier (aucun adherents.titulaire_id), jamais relancés.
 * Anti-doublon via la table relances_compte (l'insert = le claim). Envoi unique.
 */
async function relancerComptesSansInscription() {
  const supabase = getSupabaseAdmin();
  const seuilMs = Date.now() - 24 * 60 * 60 * 1000;

  // Titulaires ayant au moins un dossier (à exclure).
  const { data: adh } = await supabase
    .from("adherents")
    .select("titulaire_id")
    .not("titulaire_id", "is", null);
  const avecDossier = new Set((adh ?? []).map((a) => a.titulaire_id as string));

  // Comptes Auth (pagination).
  const users: { id: string; email: string; created_at: string; prenom: string }[] = [];
  let page = 1;
  for (;;) {
    const { data, error } = await supabase.auth.admin.listUsers({ page, perPage: 1000 });
    if (error) { console.error("auth list (relance compte):", error.message); break; }
    for (const u of data.users) {
      const meta = (u.user_metadata ?? {}) as Record<string, string>;
      users.push({
        id: u.id,
        email: u.email ?? "",
        created_at: u.created_at,
        prenom: meta.prenom || meta.first_name || (meta.full_name ?? "").split(" ")[0] || "",
      });
    }
    if (data.users.length < 1000) break;
    page++;
  }

  let envoyes = 0;
  let candidats = 0;
  for (const u of users) {
    if (!u.email) continue;
    if (avecDossier.has(u.id)) continue; // a un dossier → pas orphelin
    if (new Date(u.created_at).getTime() > seuilMs) continue; // < 24h
    candidats++;
    // Claim atomique : insert ne réussit que s'il n'y a pas déjà une ligne.
    const { error: claimErr } = await supabase
      .from("relances_compte")
      .insert({ user_id: u.id, email: u.email });
    if (claimErr) continue; // déjà relancé (conflit PK) ou erreur → on saute
    try {
      await sendCommencerInscription({ prenom: u.prenom, email: u.email });
      envoyes++;
    } catch (e) {
      console.error("Relance compte:", u.email, e);
    }
    await new Promise((r) => setTimeout(r, 300)); // pacing rate-limit Resend
  }
  return { candidats, envoyes };
}

/**
 * Relance « panier abandonné » : dossiers carte/fractionné créés mais dont le
 * paiement n'a jamais été finalisé (non engagés), depuis plus de 24h, non
 * clôturés, jamais relancés. Envoi UNIQUE (pose relance_panier_envoyee_at).
 */
async function relancerPaniersAbandonnes() {
  const supabase = getSupabaseAdmin();
  const seuil = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  const { data: dossiers } = await supabase
    .from("adherents")
    .select("id, prenom, email, created_at")
    .like("mode_paiement", "stripe%")
    .eq("statut_paiement", "en_attente")
    .is("engage_at", null)
    .is("annule_at", null)
    .is("relance_panier_envoyee_at", null)
    .lt("created_at", seuil);

  let envoyes = 0;
  for (const a of dossiers ?? []) {
    // Flag posé AVANT l'envoi (idempotence : un seul mail, même si re-run).
    const { data: claimed } = await supabase
      .from("adherents")
      .update({ relance_panier_envoyee_at: new Date().toISOString() })
      .eq("id", a.id)
      .is("relance_panier_envoyee_at", null)
      .select("id")
      .maybeSingle();
    if (!claimed || !a.email) continue;
    try {
      await sendRelancePanier({ prenom: a.prenom ?? "", email: a.email, adherentId: a.id });
      envoyes++;
    } catch (e) {
      console.error("Relance panier:", a.id, e);
    }
    await new Promise((r) => setTimeout(r, 300)); // pacing rate-limit Resend
  }
  return { candidats: dossiers?.length ?? 0, envoyes };
}
