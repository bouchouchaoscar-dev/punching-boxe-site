import { NextResponse } from "next/server";
import {
  getSupabaseAdmin,
  isSupabaseConfigured,
  STORAGE_BUCKET,
} from "@/lib/supabase";
import { getAuthUser } from "@/lib/auth-server";
import { clientIp } from "@/lib/inscription";
import { estEngage } from "@/lib/engagement";
import { deduireType, estMineur, remiseFamillePct } from "@/lib/pricing";
import { genererEtDeposerDocs } from "@/lib/pdf/generer-server";
import type { SignatureVect } from "@/lib/pdf/types";
import type { Adherent } from "@/lib/types";

export const runtime = "nodejs";

function isSignatureVect(s: unknown): s is SignatureVect {
  return (
    !!s &&
    typeof s === "object" &&
    Array.isArray((s as { strokes?: unknown }).strokes)
  );
}

const isDate = (s: string) => /^\d{4}-\d{2}-\d{2}$/.test(s) && !isNaN(Date.parse(s));

// POST — COMPLÉTION par l'adhérent d'un dossier pré-créé (tarif libre) :
// identité + contacts + (représentant légal si mineur) + signatures. Serveur
// autoritaire : montant/formule/période NON modifiables (relus en base pour le
// PDF) ; type_adherent DÉRIVÉ de la date de naissance. Patron finaliser
// (auth + titulaire_id) + patron re-signer (PDF serveur + backup).
export async function POST(request: Request) {
  if (!isSupabaseConfigured()) {
    return NextResponse.json({ error: "Supabase non configuré." }, { status: 503 });
  }
  const user = await getAuthUser(request);
  if (!user) {
    return NextResponse.json({ error: "Non authentifié." }, { status: 401 });
  }

  let body: {
    adherentId?: string;
    date_naissance?: string;
    telephone?: string;
    adresse?: string;
    ville?: string;
    code_postal?: string;
    lien_parente?: string;
    responsable?: string;
    contacts?: { nom?: string; tel?: string }[];
    autorisationMedicale?: boolean;
    signatureFiche?: unknown;
    signatureReglement?: unknown;
    photo_url?: string | null;
    certificat_medical_url?: string | null;
  };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Corps invalide." }, { status: 400 });
  }

  const adherentId = (body.adherentId || "").trim();
  if (!adherentId) {
    return NextResponse.json({ error: "Dossier non précisé." }, { status: 400 });
  }

  const supabase = getSupabaseAdmin();
  const { data: adherent } = await supabase
    .from("adherents")
    .select("*")
    .eq("id", adherentId)
    .maybeSingle();
  if (!adherent) {
    return NextResponse.json({ error: "Dossier introuvable." }, { status: 404 });
  }
  const a = adherent as Adherent;
  // [TARIF_LIBRE] LOG TEMPORAIRE #1 — valeur brute lue en base après le SELECT.
  console.log("[TARIF_LIBRE] #1 select", {
    id: a.id,
    tarif_libre: a.tarif_libre,
    type: typeof a.tarif_libre,
    date_debut: a.date_debut,
    date_fin: a.date_fin,
    montant_total: a.montant_total,
  });
  // Appartenance (jamais le dossier d'un autre titulaire).
  if (a.titulaire_id !== user.id) {
    return NextResponse.json(
      { error: "Ce dossier n'appartient pas à votre compte." },
      { status: 403 },
    );
  }
  // On ne complète qu'un dossier NON engagé (pas de réécriture d'identité après
  // paiement ; le montant/la formule restent figés par l'admin).
  if (estEngage(a)) {
    return NextResponse.json(
      { error: "Ce dossier est déjà engagé et ne peut plus être complété ici." },
      { status: 409 },
    );
  }

  // --- Validation (serveur autoritaire) ---
  const date_naissance = (body.date_naissance || "").trim();
  const telephone = (body.telephone || "").trim();
  const adresse = (body.adresse || "").trim();
  const ville = (body.ville || "").trim();
  const code_postal = (body.code_postal || "").trim();
  const lien_parente = (body.lien_parente || "").trim() || null;

  if (!isDate(date_naissance)) {
    return NextResponse.json({ error: "Date de naissance invalide." }, { status: 400 });
  }
  if (!telephone || !adresse || !ville || !code_postal) {
    return NextResponse.json(
      { error: "Téléphone, adresse, ville et code postal sont requis." },
      { status: 400 },
    );
  }

  const mineur = estMineur(date_naissance);
  const responsable = (body.responsable || "").trim();
  if (mineur && !responsable) {
    return NextResponse.json(
      { error: "Nom du représentant légal requis (adhérent mineur)." },
      { status: 400 },
    );
  }
  if (mineur && body.autorisationMedicale !== true) {
    return NextResponse.json(
      { error: "L'autorisation parentale doit être cochée." },
      { status: 400 },
    );
  }

  // Contacts d'urgence : 1er obligatoire, 2e optionnel.
  const src = Array.isArray(body.contacts) ? body.contacts : [];
  const c1n = String(src[0]?.nom ?? "").trim();
  const c1t = String(src[0]?.tel ?? "").trim();
  if (!c1n || !c1t) {
    return NextResponse.json(
      { error: "Un premier contact à prévenir (nom et téléphone) est requis." },
      { status: 400 },
    );
  }
  const c2n = String(src[1]?.nom ?? "").trim();
  const c2t = String(src[1]?.tel ?? "").trim();
  const contacts = [
    { nom: c1n, tel: c1t },
    ...(c2n || c2t ? [{ nom: c2n, tel: c2t }] : []),
  ];

  if (!isSignatureVect(body.signatureFiche) || !isSignatureVect(body.signatureReglement)) {
    return NextResponse.json(
      { error: "Les deux signatures (fiche + règlement) sont requises." },
      { status: 400 },
    );
  }

  // type_adherent DÉRIVÉ de la date de naissance (jamais fourni par le client).
  const type_adherent = deduireType(date_naissance);
  const nowIso = new Date().toISOString();

  // --- Backup best-effort des PDF existants avant écrasement (re-complétion) ---
  // Dossier storage = {adherent.id}/ (cohérent avec l'upload photo/certificat).
  const ts = nowIso.replace(/[:.]/g, "-");
  for (const nom of ["fiche.pdf", "reglement.pdf"] as const) {
    const src = `${a.id}/${nom}`;
    try {
      await supabase.storage
        .from(STORAGE_BUCKET)
        .copy(src, `${a.id}/backup/${nom.replace(".pdf", "")}.pre-complete-${ts}.pdf`);
    } catch {
      /* pas de PDF existant → rien à sauvegarder */
    }
  }

  // --- Génération fiche + règlement au montant SERVEUR (jamais un input client) ---
  let ficheUrl: string;
  let reglementUrl: string;
  // [TARIF_LIBRE] LOG TEMPORAIRE #2 — ce qui SERA injecté dans FicheData.
  console.log("[TARIF_LIBRE] #2 avant gen", {
    tarifLibreInjecte: a.tarif_libre === true,
    dateDebut: a.date_debut,
    dateFin: a.date_fin,
    montantTotal: a.montant_total,
  });
  try {
    const res = await genererEtDeposerDocs(
      supabase,
      a.id,
      {
        nom: a.nom,
        prenom: a.prenom,
        dateNaissance: date_naissance,
        telephone,
        email: a.email,
        adresse,
        codePostal: code_postal,
        ville,
        packageType: a.package,
        optionPrepa: a.option_prepa_physique ?? false,
        typeAdherent: type_adherent,
        montantTotal: a.montant_total, // ← montant SERVEUR (tarif libre figé)
        adhesionDue: a.nouveau_membre,
        remisePct: remiseFamillePct(a.nb_membres_famille ?? 0),
        // Rendu alternatif tarif libre (formule + période + montant serveur).
        tarifLibre: a.tarif_libre === true,
        dateDebut: a.date_debut,
        dateFin: a.date_fin,
        mineur,
        responsable: mineur ? responsable : null,
        autorisationMedicale: mineur ? true : undefined,
        contacts,
        signature: body.signatureFiche,
        dateSignature: nowIso,
      },
      {
        nom: a.nom,
        prenom: a.prenom,
        mineur,
        responsable: mineur ? responsable : null,
        signature: body.signatureReglement,
        dateSignature: nowIso,
      },
    );
    ficheUrl = res.ficheUrl;
    reglementUrl = res.reglementUrl;
  } catch (e) {
    console.error("Génération documents (complétion):", e);
    return NextResponse.json(
      { error: "La génération des documents a échoué. Réessayez." },
      { status: 500 },
    );
  }

  // --- Mise à jour du dossier : champs WHITELISTÉS uniquement ---
  const { error: upErr } = await supabase
    .from("adherents")
    .update({
      date_naissance,
      type_adherent, // dérivé serveur
      telephone,
      adresse,
      ville,
      code_postal,
      lien_parente,
      ...(mineur ? { responsable } : {}),
      fiche_inscription_url: ficheUrl,
      reglement_url: reglementUrl,
      fiche_signee_at: nowIso,
      reglement_signee_at: nowIso,
      signature_ip: clientIp(request),
      // Pièces déposées via l'espace (upload dans {id}/…). URLs persistées ici
      // (le flux upload ne persiste pas seul). Non fournies → inchangées.
      ...(typeof body.photo_url === "string" ? { photo_url: body.photo_url } : {}),
      ...(typeof body.certificat_medical_url === "string"
        ? { certificat_medical_url: body.certificat_medical_url }
        : {}),
    })
    .eq("id", a.id);
  if (upErr) {
    return NextResponse.json(
      { error: "Enregistrement impossible : " + upErr.message },
      { status: 500 },
    );
  }

  return NextResponse.json({ success: true, adherentId: a.id });
}
