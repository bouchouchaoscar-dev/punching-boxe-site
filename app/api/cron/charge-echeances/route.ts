import { NextResponse } from "next/server";
import { getSupabaseAdmin, isSupabaseConfigured, exigerData } from "@/lib/supabase";
import { isStripeConfigured } from "@/lib/stripe";
import { chargerEcheance } from "@/lib/payments";
import { CONFIG_CLUB } from "@/lib/config-club";

// Délais de relance (config club), convertis en millisecondes.
const H = 60 * 60 * 1000;
const RELANCES = CONFIG_CLUB.seuils.relances;
import {
  sendRelancePanier,
  sendRelancePanier2,
  sendCommencerInscription,
  sendPaiementEchec,
  sendRelanceDossier,
  sendRelanceChangement,
} from "@/lib/email";
import { statutTrombi } from "@/lib/paiement";
import { estMineur } from "@/lib/pricing";
import { estEmailValide, normaliserEmail } from "@/lib/email-format";
import { saisonCourante } from "@/lib/saison";
import { etatDossierRelance, estDossierARelancer, numeroRelanceDossier } from "@/lib/relance-dossier";
import { restantChangement, changementAFaire } from "@/lib/changement-formule";
import { lienSignatureFiche } from "@/lib/changement-formule-server";
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
  const dues = exigerData(
    await supabase
      .from("campagnes")
      .select("id")
      .eq("statut", "planifiee")
      .eq("etat", "active")
      .lte("scheduled_at", nowIso),
    "campagnes planifiées: select",
  );

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
        nb_exclus: res.exclus + res.exclusSansEmail + res.exclusInvalides,
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
  // Mode SIMULATION (?dryRun=true) : même auth, AUCUN effet de bord (aucun mail,
  // aucune écriture). Ne lit que la table adhérents → Supabase suffit (Stripe non
  // requis, la simulation reste utilisable en maquette). Renvoie la liste des
  // dossiers qui SERAIENT relancés.
  const dryRun = new URL(request.url).searchParams.get("dryRun") === "true";
  if (dryRun) {
    if (!isSupabaseConfigured()) {
      return NextResponse.json({ error: "Non configuré." }, { status: 503 });
    }
    const relancesDossier = await relancerDossiersSansPaiement(true);
    return NextResponse.json({ dryRun: true, relancesDossier });
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

  // Chaque passe de relance lit `error` et LÈVE si la requête échoue (helper
  // exigerData) : une requête cassée ne vaut jamais « 0 relance ». On isole
  // chaque passe pour qu'une erreur soit REMONTÉE (loguée + exposée dans la
  // réponse JSON, champ `erreurs`) sans bloquer les autres passes ni les
  // prélèvements déjà faits. Cf. LESSONS.md.
  const erreurs: Record<string, string> = {};
  const passe = async <T>(nom: string, fn: () => Promise<T>): Promise<T | null> => {
    try {
      return await fn();
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      erreurs[nom] = msg;
      console.error(`[cron charge-echeances] ${nom}:`, msg);
      return null;
    }
  };

  const campagnes = await passe("campagnes", envoyerCampagnesPlanifiees);
  const relances = await passe("relancesPanier", relancerPaniersAbandonnes);
  const relances2 = await passe("relancesPanier2", relancerPaniersAbandonnes2);
  const relancesComptes = await passe("relancesComptes", relancerComptesSansInscription);
  const rappelsEchec = await passe("rappelsEchec", relancerEchecs48h);
  const relancesDossier = await passe("relancesDossier", () => relancerDossiersSansPaiement());
  const relancesChangement = await passe("relancesChangement", relancerChangementsFormule);

  return NextResponse.json({
    traitees: results.length,
    results,
    campagnes,
    relances,
    relances2,
    relancesComptes,
    rappelsEchec,
    relancesDossier,
    relancesChangement,
    erreurs: Object.keys(erreurs).length ? erreurs : undefined,
  });
}

/**
 * Rappel UNIQUE (J+48h) aux adhérents ayant une échéance en échec non
 * régularisée. Sélection : statut='echec' ET echec_a < now()-48h ET
 * rappel_echec_envoye=false. CLAIM-THEN-SEND (rappel_echec_envoye) → jamais
 * deux rappels. Si l'échéance est régularisée entre-temps (statut != 'echec'),
 * elle sort du filtre → aucun rappel. ROBUSTE : la requête lit `error`
 * (exigerData) et LÈVE si elle échoue (ex. colonnes 007 absentes) — l'erreur est
 * remontée à la passe englobante, jamais transformée en « 0 rappel » muet.
 */
async function relancerEchecs48h(): Promise<{ envoyes: number }> {
  const supabase = getSupabaseAdmin();
  const seuil = new Date(Date.now() - RELANCES.echecH * H).toISOString();

  const echecs = exigerData(
    await supabase
      .from("paiements")
      .select("id, adherent_id, montant, date_prevue, numero_echeance")
      .eq("statut", "echec")
      .eq("rappel_echec_envoye", false)
      .not("echec_a", "is", null)
      .lt("echec_a", seuil),
    "rappel échec 48h: select",
  );
  if (!echecs?.length) return { envoyes: 0 };

  let envoyes = 0;
  for (const p of echecs) {
    // Claim atomique AVANT envoi → un seul rappel.
    const { data: claimed } = await supabase
      .from("paiements")
      .update({ rappel_echec_envoye: true })
      .eq("id", p.id)
      .eq("rappel_echec_envoye", false)
      .select("id")
      .maybeSingle();
    if (!claimed) continue;

    const adh = exigerData(
      await supabase
        .from("adherents")
        .select("prenom, email, nb_echeances, derniere_erreur_code")
        .eq("id", p.adherent_id)
        .maybeSingle(),
      "rappel échec 48h: lecture adhérent",
    );
    if (!adh?.email) continue;
    try {
      await sendPaiementEchec({
        prenom: adh.prenom,
        email: adh.email,
        montant: Number(p.montant || 0),
        date: p.date_prevue,
        numero: p.numero_echeance,
        nbEcheances: adh.nb_echeances,
        code: adh.derniere_erreur_code,
        rappel: true,
      });
      envoyes++;
    } catch (e) {
      console.error("Rappel échec paiement:", e);
    }
  }
  return { envoyes };
}

/**
 * Relance « compte sans inscription » : comptes Auth créés depuis plus de 24h
 * qui n'ont AUCUN dossier (aucun adherents.titulaire_id), jamais relancés.
 * Anti-doublon via la table relances_compte (l'insert = le claim). Envoi unique.
 */
async function relancerComptesSansInscription() {
  const supabase = getSupabaseAdmin();
  const seuilMs = Date.now() - RELANCES.compteSansInscriptionH * H;

  // Titulaires ayant au moins un dossier (à exclure).
  const adh = exigerData(
    await supabase.from("adherents").select("titulaire_id").not("titulaire_id", "is", null),
    "relance comptes: select titulaires",
  );
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
// Exclusions RGPD (désinscrits + bounces), comme les campagnes.
async function chargerExclusionsMail(supabase: ReturnType<typeof getSupabaseAdmin>): Promise<Set<string>> {
  const [{ data: opt }, { data: bnc }] = await Promise.all([
    supabase.from("desinscriptions_mailing").select("email"),
    supabase.from("emails_bounced").select("email"),
  ]);
  return new Set([
    ...(opt ?? []).map((o) => normaliserEmail(o.email as string)),
    ...(bnc ?? []).map((b) => normaliserEmail(b.email as string)),
  ]);
}

// Relance des DOSSIERS sans mode de paiement choisi (statut « à finaliser » +
// mode null). NE touche PAS aux cartes non finalisées (mode stripe → paniers).
// Relance 1 : >= dossier1Jours après création. Relance 2 : >= dossier2Jours après
// la relance 1. Ensuite plus rien (l'admin prend le relais). Claim idempotent.
async function relancerDossiersSansPaiement(dryRun = false) {
  const supabase = getSupabaseAdmin();
  const now = Date.now();
  const exclusions = await chargerExclusionsMail(supabase);
  const champs =
    "id, prenom, nom, email, date_naissance, created_at, mode_paiement, statut_paiement, nb_echeances, echeances_payees, engage_at, annule_at, titulaire_id, relance_dossier_1_at, relance_dossier_2_at, fiche_valide, reglement_valide, photo_valide, certificat_valide, certificat_medical_url, fiche_signee_at, reglement_signee_at, fiche_inscription_url, reglement_url, photo_url";
  // Ne JAMAIS avaler l'erreur en `data ?? []`. Un échec de requête (ex. migration
  // 016 non appliquée → colonnes absentes) doit remonter, pas se faire passer pour
  // « 0 dossier » (cause du faux « aucun éligible » précédent). Cf. LESSONS.md.
  const data = exigerData(
    await supabase
      .from("adherents")
      .select(champs)
      .eq("saison", saisonCourante(new Date()))
      .is("mode_paiement", null)
      .is("engage_at", null)
      .is("annule_at", null)
      .not("titulaire_id", "is", null),
    "relance dossiers sans paiement: select",
  );

  // Règle SOURCE UNIQUE : statutTrombi === "a_finaliser" (mode null, rien encaissé).
  const candidats = (data ?? []).filter((a) => estDossierARelancer(a as Parameters<typeof estDossierARelancer>[0]));

  // Liste des dossiers qui SERAIENT relancés (numéro dû + email valide + non exclu),
  // calculée sans aucun effet de bord. En dryRun on la renvoie et on s'arrête là.
  const eligibles = candidats
    .map((a) => {
      const numero = numeroRelanceDossier({
        createdAt: a.created_at as string,
        relance1At: a.relance_dossier_1_at as string | null,
        relance2At: a.relance_dossier_2_at as string | null,
        now,
        jours1: CONFIG_CLUB.seuils.relances.dossier1Jours,
        jours2: CONFIG_CLUB.seuils.relances.dossier2Jours,
      });
      const email = normaliserEmail(a.email as string);
      const exclu = !email || !estEmailValide(email) || exclusions.has(email);
      return { a, numero, email, exclu };
    })
    .filter((x) => x.numero !== null && !x.exclu);

  if (dryRun) {
    return {
      dryRun: true as const,
      candidats: candidats.length,
      aRelancer: eligibles.map((x) => ({
        id: x.a.id as string,
        nom: `${x.a.prenom ?? ""} ${x.a.nom ?? ""}`.trim(),
        numero: x.numero as 1 | 2,
        created_at: x.a.created_at as string,
        etat: etatDossierRelance(x.a as Parameters<typeof etatDossierRelance>[0]).etat,
      })),
    };
  }

  let relance1 = 0;
  let relance2 = 0;
  for (const { a, numero, email } of eligibles) {
    const col = numero === 1 ? "relance_dossier_1_at" : "relance_dossier_2_at";

    // Claim atomique : jamais deux envois.
    const { data: claimed } = await supabase
      .from("adherents")
      .update({ [col]: new Date().toISOString() })
      .eq("id", a.id)
      .is(col, null)
      .select("id")
      .maybeSingle();
    if (!claimed) continue;

    const { etat, manques } = etatDossierRelance(a as Parameters<typeof etatDossierRelance>[0]);
    try {
      await sendRelanceDossier({ email, prenom: (a.prenom as string) ?? "", mineur: estMineur(a.date_naissance as string), numero: numero as 1 | 2, etat, manques });
      if (numero === 1) relance1++;
      else relance2++;
    } catch (e) {
      console.error("Relance dossier:", a.id, e);
    }
    await new Promise((r) => setTimeout(r, 300)); // pacing Resend
  }
  return { candidats: candidats.length, relance1, relance2 };
}

// [018] Relances des CHANGEMENTS DE FORMULE (section 5). Source 'admin' : supplément
// carte non encaissé et/ou fiche non signée. Source 'adherent' : SIGNATURE
// uniquement (le paiement adhérent n'est pas relancé ici). Jamais pour espèces,
// ni pour un « offert » signé. Relance 1 >= 48 h, relance 2 >= 7 j. Claim idempotent
// par relance_1_at puis relance_2_at. Exclusions désinscrits/bounces/invalides.
async function relancerChangementsFormule() {
  const supabase = getSupabaseAdmin();
  const now = Date.now();
  const exclusions = await chargerExclusionsMail(supabase);

  const data = exigerData(
    await supabase
      .from("changements_formule")
      .select("id, dossier_id, source, statut, mode_reglement, montant_cents, signature_requise, signe_at, paiement_id, relance_1_at, relance_2_at, created_at")
      .eq("statut", "actif"),
    "relance changements: select",
  );
  const changements = (data ?? []) as Record<string, unknown>[];
  if (changements.length === 0) return { candidats: 0, relance1: 0, relance2: 0 };

  // Statuts des paiements « supplément » liés (pour savoir si la carte est encaissée).
  const paieIds = [...new Set(changements.map((c) => c.paiement_id).filter(Boolean))] as string[];
  const statutPaie = new Map<string, string>();
  if (paieIds.length) {
    const pays = exigerData(await supabase.from("paiements").select("id, statut").in("id", paieIds), "relance changements: paiements");
    for (const p of pays ?? []) statutPaie.set(p.id as string, p.statut as string);
  }

  let relance1 = 0;
  let relance2 = 0;
  let candidats = 0;
  for (const ch of changements) {
    const supplementPaye = ch.paiement_id ? statutPaie.get(ch.paiement_id as string) === "paye" : true;
    let restant = restantChangement({
      source: ch.source as string | null,
      statut: ch.statut as string | null,
      mode_reglement: ch.mode_reglement as string | null,
      signature_requise: ch.signature_requise as boolean | null,
      signe_at: ch.signe_at as string | null,
      supplementPaye,
    });
    // Source 'adherent' : relance la SIGNATURE uniquement (jamais le paiement).
    if (ch.source === "adherent") restant = { paiementCarte: false, signature: restant.signature };
    if (!changementAFaire(restant)) continue;
    candidats++;

    const r1 = ch.relance_1_at as string | null;
    const r2 = ch.relance_2_at as string | null;
    const cree = new Date(ch.created_at as string).getTime();
    let numero: 1 | 2 | null = null;
    let col = "";
    if (!r1 && cree <= now - RELANCES.changement1Heures * H) { numero = 1; col = "relance_1_at"; }
    else if (r1 && !r2 && cree <= now - RELANCES.changement2Jours * 24 * H) { numero = 2; col = "relance_2_at"; }
    if (!numero) continue;

    // Adhérent (email + prénom + mineur).
    const { data: adh } = await supabase
      .from("adherents")
      .select("prenom, email, date_naissance")
      .eq("id", ch.dossier_id as string)
      .maybeSingle();
    const email = normaliserEmail((adh?.email as string) ?? "");
    if (!email || !estEmailValide(email) || exclusions.has(email)) continue;

    // Claim atomique : jamais deux relances pour le même palier.
    const { data: claimed } = await supabase
      .from("changements_formule")
      .update({ [col]: new Date().toISOString() })
      .eq("id", ch.id as string)
      .is(col, null)
      .select("id")
      .maybeSingle();
    if (!claimed) continue;

    try {
      await sendRelanceChangement({
        email,
        prenom: (adh?.prenom as string) ?? "",
        mineur: estMineur(adh?.date_naissance as string),
        numero,
        restant,
        montantEuros: Math.max(0, (ch.montant_cents as number) ?? 0) / 100,
        lienSigner: restant.signature ? lienSignatureFiche(ch.dossier_id as string) : null,
      });
      if (numero === 1) relance1++;
      else relance2++;
    } catch (e) {
      console.error("Relance changement formule:", ch.id, e);
    }
    await new Promise((r) => setTimeout(r, 300)); // pacing Resend
  }
  return { candidats, relance1, relance2 };
}

async function relancerPaniersAbandonnes() {
  const supabase = getSupabaseAdmin();
  const seuil = new Date(Date.now() - RELANCES.panierH * H).toISOString();
  const dossiers = exigerData(
    await supabase
      .from("adherents")
      .select("id, prenom, email, created_at")
      .like("mode_paiement", "stripe%")
      .eq("statut_paiement", "en_attente")
      .is("engage_at", null)
      .is("annule_at", null)
      .is("relance_panier_envoyee_at", null)
      .lt("created_at", seuil),
    "relance panier 1: select dossiers",
  );

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

/**
 * 2e (et DERNIÈRE) relance « panier abandonné » (~J+3) : dossiers carte non
 * finalisés dont la 1ère relance est DÉJÀ partie (relance_panier_envoyee_at non
 * nul) depuis au moins 48h, toujours 'en_attente' / non engagés / non annulés,
 * et pas encore relancés une 2e fois. Envoi UNIQUE (flag distinct
 * relance_panier_2_envoyee_at). AUCUNE 3e relance ensuite.
 *
 * NE MODIFIE PAS relancerPaniersAbandonnes (1ère relance, flag séparé).
 * ROBUSTE : la requête lit `error` (exigerData) et LÈVE si elle échoue (ex.
 * colonne 008 absente) — l'erreur est remontée à la passe englobante (loguée +
 * exposée), jamais transformée en « 0 envoi » muet. Cf. LESSONS.md.
 */
async function relancerPaniersAbandonnes2(): Promise<{
  candidats: number;
  envoyes: number;
}> {
  const supabase = getSupabaseAdmin();
  const seuil = new Date(Date.now() - RELANCES.panier2H * H).toISOString();
  const dossiers = exigerData(
    await supabase
      .from("adherents")
      .select("id, prenom, email")
      .like("mode_paiement", "stripe%")
      .eq("statut_paiement", "en_attente")
      .is("engage_at", null)
      .is("annule_at", null)
      .not("relance_panier_envoyee_at", "is", null) // 1ère relance déjà partie
      .is("relance_panier_2_envoyee_at", null) // 2e pas encore envoyée
      .lt("relance_panier_envoyee_at", seuil), // au moins 48h après la 1ère
    "relance panier 2: select dossiers",
  );
  if (!dossiers?.length) return { candidats: 0, envoyes: 0 };

  let envoyes = 0;
  for (const a of dossiers) {
    // Claim atomique AVANT envoi → un seul 2e mail, jamais de 3e.
    const { data: claimed } = await supabase
      .from("adherents")
      .update({ relance_panier_2_envoyee_at: new Date().toISOString() })
      .eq("id", a.id)
      .is("relance_panier_2_envoyee_at", null)
      .select("id")
      .maybeSingle();
    if (!claimed || !a.email) continue;
    try {
      await sendRelancePanier2({ prenom: a.prenom ?? "", email: a.email, adherentId: a.id });
      envoyes++;
    } catch (e) {
      console.error("Relance panier 2:", a.id, e);
    }
    await new Promise((r) => setTimeout(r, 300)); // pacing rate-limit Resend
  }
  return { candidats: dossiers.length, envoyes };
}
