import { NextResponse } from "next/server";
import { getSupabaseAdmin, isSupabaseConfigured } from "@/lib/supabase";
import {
  buildAdherentInsert,
  validatePayload,
  clientIp,
  OPTIONAL_DOC_COLUMNS,
  type InscriptionPayload,
} from "@/lib/inscription";
import { sendAdherentConfirmation, sendAdminNotification } from "@/lib/email";
import { remiseFamillePct } from "@/lib/pricing";
import {
  analyserFoyer,
  appliquerMerges,
  rattachementsRenseignes,
} from "@/lib/foyer-server";
import { getAuthUser } from "@/lib/auth-server";
import { estJuin, saisonCourante, saisonQuiSeTermine } from "@/lib/saison";
import { evaluerAnciennete } from "@/lib/anciennete";

export const runtime = "nodejs";

// POST — création d'un adhérent (utilisé pour le paiement en espèces).
export async function POST(request: Request) {
  if (!isSupabaseConfigured()) {
    return NextResponse.json(
      { error: "Supabase non configuré sur le serveur." },
      { status: 503 },
    );
  }

  // Le dossier est rattaché au compte connecté (titulaire). Pas de session
  // valide → pas de dossier orphelin.
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
    return NextResponse.json({ error: "Corps de requête invalide." }, { status: 400 });
  }

  const err = validatePayload(payload);
  if (err) return NextResponse.json({ error: err }, { status: 400 });

  const supabase = getSupabaseAdmin();

  // Remise famille (autorité serveur) : décompte du foyer = membres FINALISÉS/
  // ENGAGÉS (espèces en attente incluses) et NON fermés, union groupés ∪ rattachés.
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

  // Ancienneté (autorité serveur sur l'adhésion 30€), même pour les espèces.
  const now = new Date();
  const saisonEnCours = !!payloadAuto.saison_en_cours && estJuin(now);
  const saisonInscription = saisonEnCours
    ? saisonQuiSeTermine(now)
    : saisonCourante(now);
  const anc = await evaluerAnciennete(supabase, payload, saisonInscription);
  payloadAuto.nouveau_membre = anc.paieAdhesion; // on n'écoute plus le client

  // Espèces → en_attente ; paiement carte traité via create-payment-intent.
  // titulaire_id = user.id (jamais une valeur fournie par le client).
  // montant_total est recalculé par buildAdherentInsert avec le bon nouveau_membre.
  const record = {
    ...buildAdherentInsert(payloadAuto, "en_attente", user.id),
    ancien_id: anc.ancienId,
    match_a_verifier: anc.ambigu,
    foyer_id: analyse.foyerFinal,
    attestation_foyer_at: attestationAt,
    // Fiche + règlement générés/signés en ligne → AUTO-VALIDÉS + trace.
    fiche_valide: !!payload.fiche_inscription_url,
    reglement_valide: !!payload.reglement_url,
    fiche_signee_at: payload.fiche_inscription_url ? new Date().toISOString() : null,
    reglement_signee_at: payload.reglement_url ? new Date().toISOString() : null,
    signature_ip:
      payload.fiche_inscription_url || payload.reglement_url ? clientIp(request) : null,
  };

  let { data, error } = await supabase
    .from("adherents")
    .insert(record)
    .select()
    .single();

  // Tolérance : si les migrations de validation des documents ne sont pas encore
  // appliquées, on réessaie sans ces colonnes (DEFAULT pris à la création).
  if (error && OPTIONAL_DOC_COLUMNS.some((c) => error!.message.includes(c))) {
    const rest = { ...record } as Record<string, unknown>;
    for (const c of OPTIONAL_DOC_COLUMNS) delete rest[c];
    ({ data, error } = await supabase
      .from("adherents")
      .insert(rest)
      .select()
      .single());
  }

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // Emails (best-effort, n'interrompent pas la réponse).
  try {
    await Promise.all([
      sendAdherentConfirmation({ ...record, adherentId: data.id }),
      sendAdminNotification({ ...record, adherentId: data.id }),
    ]);
  } catch (e) {
    console.error("Email error:", e);
  }

  return NextResponse.json({ adherent: data }, { status: 201 });
}

// GET — liste des adhérents (dashboard admin).
export async function GET(request: Request) {
  if (!isSupabaseConfigured()) {
    return NextResponse.json({ adherents: [] });
  }
  const { searchParams } = new URL(request.url);
  const saison = searchParams.get("saison");

  const supabase = getSupabaseAdmin();
  let query = supabase
    .from("adherents")
    .select("*")
    .order("created_at", { ascending: false });

  if (saison) query = query.eq("saison", saison);

  const { data, error } = await query;
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ adherents: data ?? [] });
}
