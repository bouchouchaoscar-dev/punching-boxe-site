import { NextResponse } from "next/server";
import { getStripe, isStripeConfigured } from "@/lib/stripe";
import { getSupabaseAdmin, isSupabaseConfigured } from "@/lib/supabase";
import {
  buildAdherentInsert,
  validatePayload,
  clientIp,
  OPTIONAL_DOC_COLUMNS,
  type InscriptionPayload,
} from "@/lib/inscription";
import { nbEcheances, remiseFamillePct } from "@/lib/pricing";
import { devisPourAdherent, planEcheances } from "@/lib/tarifs";
import {
  analyserFoyer,
  appliquerMerges,
  rattachementsRenseignes,
} from "@/lib/foyer-server";
import { getAuthUser } from "@/lib/auth-server";
import { estJuin, saisonCourante, saisonQuiSeTermine } from "@/lib/saison";
import { evaluerAnciennete } from "@/lib/anciennete";

export const runtime = "nodejs";

export async function POST(request: Request) {
  if (!isStripeConfigured() || !isSupabaseConfigured()) {
    return NextResponse.json(
      { error: "Paiement en ligne non configuré (Stripe / Supabase)." },
      { status: 503 },
    );
  }

  // Rattachement au compte titulaire connecté (sécurité : id résolu serveur).
  const user = await getAuthUser(request);
  if (!user) {
    return NextResponse.json(
      { error: "Connexion requise pour vous inscrire." },
      { status: 401 },
    );
  }

  let payload: InscriptionPayload;
  try {
    payload = (await request.json()) as InscriptionPayload;
  } catch {
    return NextResponse.json({ error: "Corps invalide." }, { status: 400 });
  }

  const err = validatePayload(payload);
  if (err) return NextResponse.json({ error: err }, { status: 400 });
  if (!payload.mode_paiement.startsWith("stripe")) {
    return NextResponse.json({ error: "Mode de paiement non Stripe." }, { status: 400 });
  }

  const supabase = getSupabaseAdmin();

  // Remise famille (autorité serveur) : décompte du foyer = membres FINALISÉS/
  // ENGAGÉS (espèces en attente incluses) et NON fermés, en union groupés ∪
  // rattachés. Valeur client ignorée.
  const foyerNewId = crypto.randomUUID();
  const analyse = await analyserFoyer(supabase, {
    titulaireId: user.id,
    rattachements: payload.rattachements,
    newId: foyerNewId,
  });
  if (!analyse.ok) {
    const msgFoyer =
      analyse.raison === "introuvable"
        ? "Un membre de famille indiqué n'a pas encore de dossier. Cette personne doit d'abord être inscrite."
        : analyse.raison === "ferme"
          ? "Un membre indiqué a bien été trouvé, mais son inscription a été arrêtée (désinscrit). Il ne peut pas être pris en compte dans la remise familiale."
          : "Plusieurs personnes correspondent à un membre indiqué. Contactez le club pour le rattachement.";
    return NextResponse.json({ error: msgFoyer }, { status: 400 });
  }
  const lienCree = rattachementsRenseignes(payload.rattachements).length > 0;
  const remiseApplicable = remiseFamillePct(analyse.nbMembres) > 0;
  if ((lienCree || remiseApplicable) && payload.attestation_foyer !== true) {
    return NextResponse.json(
      { error: "Attestation du foyer familial requise pour la remise." },
      { status: 400 },
    );
  }
  if (analyse.merges) await appliquerMerges(supabase, analyse.merges);
  const attestationAt =
    (lienCree || remiseApplicable) && payload.attestation_foyer === true
      ? new Date().toISOString()
      : null;
  const payloadAuto = {
    ...payload,
    nb_membres_famille: analyse.nbMembres,
  };

  const now = new Date();
  // Ancienneté (autorité serveur sur l'adhésion 30€) : saison d'inscription
  // calculée comme à la création du dossier (bascule juin incluse).
  const saisonEnCours = !!payloadAuto.saison_en_cours && estJuin(now);
  const saisonInscription = saisonEnCours
    ? saisonQuiSeTermine(now)
    : saisonCourante(now);
  const anc = await evaluerAnciennete(supabase, payload, saisonInscription);
  // On écrase la valeur client : le serveur décide qui paie les 30€.
  payloadAuto.nouveau_membre = anc.paieAdhesion;

  // La table de paliers gère la bascule juin (plancher vs plein) ; on transmet le drapeau.
  const devis = devisPourAdherent(payloadAuto, now, !!payloadAuto.saison_en_cours);
  const n = nbEcheances(payload.mode_paiement);

  // Sécurité : l'échéancier demandé doit être autorisé pour cette date.
  if (!devis.echeancesAutorisees.includes(n)) {
    return NextResponse.json(
      { error: "Échéancier non disponible à cette période de la saison." },
      { status: 400 },
    );
  }

  const plan = planEcheances(devis.fractionnable, devis.adhesion, now, n);

  // Adhérent (montant proratisé recalculé côté serveur).
  const record = {
    ...buildAdherentInsert(payloadAuto, "en_attente", user.id),
    montant_total: devis.total,
    nb_echeances: n,
    prochaine_echeance: n > 1 ? plan.dates[1] : null,
    // Matching ancienneté : lien ferme si 1 candidat, flag si ambigu.
    ancien_id: anc.ancienId,
    match_a_verifier: anc.ambigu,
    // Foyer élargi + trace de l'attestation sur l'honneur.
    foyer_id: analyse.foyerFinal,
    attestation_foyer_at: attestationAt,
    // Fiche + règlement générés/signés en ligne → AUTO-VALIDÉS (PDF système,
    // fiables) + trace (horodatage signature + IP). Certificat/photo restent
    // en validation manuelle.
    fiche_valide: !!payload.fiche_inscription_url,
    reglement_valide: !!payload.reglement_url,
    fiche_signee_at: payload.fiche_inscription_url ? new Date().toISOString() : null,
    reglement_signee_at: payload.reglement_url ? new Date().toISOString() : null,
    signature_ip:
      payload.fiche_inscription_url || payload.reglement_url ? clientIp(request) : null,
  };
  let { data: adherent, error: insErr } = await supabase
    .from("adherents")
    .insert(record)
    .select()
    .single();
  if (insErr && OPTIONAL_DOC_COLUMNS.some((c) => insErr!.message.includes(c))) {
    const rest = { ...record } as Record<string, unknown>;
    for (const c of OPTIONAL_DOC_COLUMNS) delete rest[c];
    ({ data: adherent, error: insErr } = await supabase
      .from("adherents")
      .insert(rest)
      .select()
      .single());
  }
  if (insErr || !adherent) {
    return NextResponse.json(
      { error: insErr?.message || "Insertion impossible." },
      { status: 500 },
    );
  }

  const stripe = getStripe();
  try {
    const customer = await stripe.customers.create({
      email: record.email,
      name: `${record.prenom} ${record.nom}`,
      metadata: { adherentId: adherent.id, saison: record.saison },
    });

    // -------- Paiement comptant (1x) --------
    if (n === 1) {
      const intent = await stripe.paymentIntents.create({
        amount: Math.round(devis.total * 100),
        currency: "eur",
        customer: customer.id,
        payment_method_types: ["card"],
        description: `Inscription ${record.saison} — ${record.prenom} ${record.nom}`,
        metadata: { adherentId: adherent.id, numero: "1", type: "comptant" },
      });

      await supabase
        .from("adherents")
        .update({
          stripe_customer_id: customer.id,
          stripe_payment_intent_id: intent.id,
        })
        .eq("id", adherent.id);

      // Échéance unique en attente (sera marquée payée au succès).
      await supabase.from("paiements").insert({
        adherent_id: adherent.id,
        stripe_payment_intent_id: intent.id,
        montant: devis.total,
        statut: "en_attente",
        numero_echeance: 1,
        date_prevue: plan.dates[0],
      });

      return NextResponse.json({
        intentType: "payment",
        clientSecret: intent.client_secret,
        adherentId: adherent.id,
        nbEcheances: 1,
        total: devis.total,
        adhesion: devis.adhesion,
        proratise: devis.proratise,
        premierPrelevement: devis.total,
        dates: plan.dates,
        montants: plan.montants,
      });
    }

    // -------- Paiement fractionné (2x/3x/4x) : enregistrement de la carte --------
    const setupIntent = await stripe.setupIntents.create({
      customer: customer.id,
      usage: "off_session",
      payment_method_types: ["card"],
      metadata: { adherentId: adherent.id, echeances: String(n) },
    });

    await supabase
      .from("adherents")
      .update({
        stripe_customer_id: customer.id,
        stripe_setup_intent_id: setupIntent.id,
      })
      .eq("id", adherent.id);

    return NextResponse.json({
      intentType: "setup",
      clientSecret: setupIntent.client_secret,
      adherentId: adherent.id,
      nbEcheances: n,
      total: devis.total,
      adhesion: devis.adhesion,
      proratise: devis.proratise,
      premierPrelevement: plan.premierPrelevement,
      dates: plan.dates,
      montants: plan.montants,
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Erreur Stripe.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
