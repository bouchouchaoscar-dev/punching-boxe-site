import { NextResponse } from "next/server";
import { verifyResignatureToken, type ResignDoc } from "@/lib/resignature-link";
import {
  getSupabaseAdmin,
  isSupabaseConfigured,
  STORAGE_BUCKET,
} from "@/lib/supabase";
import { clientIp } from "@/lib/inscription";
import { estMineurISO } from "@/lib/resignature-data";
import { renderReglementPdf } from "@/lib/pdf/render";
import {
  sendReSignatureConfirmationAdherent,
  sendReSignatureConfirmationAdmin,
} from "@/lib/email";
import type { SignatureVect } from "@/lib/pdf/types";
import type { Adherent } from "@/lib/types";
import type { SupabaseClient } from "@supabase/supabase-js";

export const runtime = "nodejs";

// Re-signature réelle. LOT 4a : régénération du RÈGLEMENT (doc entièrement
// reconstructible). Le doc « fiche » reste au STUB jusqu'au lot 4b (contacts
// d'urgence non persistés). Serveur autoritaire : nom relu en base ; le client
// ne fournit que la signature + le nom du représentant légal.

function isSignatureVect(s: unknown): s is SignatureVect {
  return (
    !!s &&
    typeof s === "object" &&
    Array.isArray((s as { strokes?: unknown }).strokes)
  );
}

/** Extrait le chemin storage (`<dossier>/reglement.pdf`) depuis l'URL publique
 *  existante — jamais reconstruit depuis l'id DB (le dossier porte un UUID ≠ id). */
function storagePathFromUrl(url: string): string | null {
  const marker = `/object/public/${STORAGE_BUCKET}/`;
  const i = url.indexOf(marker);
  if (i < 0) return null;
  return decodeURIComponent(url.slice(i + marker.length));
}

export async function POST(request: Request) {
  let body: {
    a?: string;
    doc?: string;
    exp?: string;
    t?: string;
    docToSign?: string;
    signature?: unknown;
    responsable?: string;
  };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Corps invalide." }, { status: 400 });
  }

  // 1) Token HMAC scopé + non expiré (fail-closed).
  const verified = verifyResignatureToken(
    body.a ?? "",
    body.doc ?? "",
    body.exp ?? "",
    body.t ?? "",
  );
  if (!verified) {
    return NextResponse.json(
      { error: "Ce lien de re-signature est invalide ou a expiré." },
      { status: 403 },
    );
  }

  const docToSign = body.docToSign as ResignDoc;
  if (
    (docToSign !== "fiche" && docToSign !== "reglement") ||
    !verified.docs.includes(docToSign)
  ) {
    return NextResponse.json(
      { error: "Document non autorisé pour ce lien." },
      { status: 400 },
    );
  }

  if (!isSupabaseConfigured()) {
    return NextResponse.json({ error: "Service indisponible." }, { status: 503 });
  }

  const supabase = getSupabaseAdmin();
  const { data } = await supabase
    .from("adherents")
    .select(
      "id, prenom, nom, email, date_naissance, reglement_url, reglement_a_resigner, fiche_a_resigner, responsable",
    )
    .eq("id", verified.adherentId)
    .maybeSingle();
  if (!data) {
    return NextResponse.json({ error: "Dossier introuvable." }, { status: 404 });
  }
  const adherent = data as Adherent;

  // ---- FICHE : reste au stub jusqu'au lot 4b ----
  if (docToSign === "fiche") {
    if (!adherent.fiche_a_resigner) {
      return NextResponse.json(
        { error: "Aucune re-signature demandée pour ce document." },
        { status: 409 },
      );
    }
    return NextResponse.json({ received: true, stub: true, doc: "fiche" });
  }

  // ---- RÈGLEMENT : régénération réelle ----
  return regenererReglement(supabase, request, adherent, body);
}

async function regenererReglement(
  supabase: SupabaseClient,
  request: Request,
  adherent: Adherent,
  body: { signature?: unknown; responsable?: string },
): Promise<Response> {
  const id = adherent.id;

  // 2) IDEMPOTENCE — claim atomique du flag (false->true déjà pris = re-signé).
  //    Un seul passage gagne ; les doublons/retries sont accusés sans régénérer.
  const { data: claimed } = await supabase
    .from("adherents")
    .update({ reglement_a_resigner: false })
    .eq("id", id)
    .eq("reglement_a_resigner", true)
    .select("id")
    .maybeSingle();
  if (!claimed) {
    return NextResponse.json({ received: true, alreadyDone: true, doc: "reglement" });
  }

  // Rollback du flag si la suite échoue (l'adhérent pourra réessayer).
  const rollback = async () => {
    await supabase
      .from("adherents")
      .update({ reglement_a_resigner: true })
      .eq("id", id);
  };

  // 3) Validation des entrées (le nom vient de la base ; le client ne fournit
  //    que la signature + le responsable).
  const mineur = estMineurISO(adherent.date_naissance);
  const responsable = (body.responsable ?? "").trim();
  if (mineur && !responsable) {
    await rollback();
    return NextResponse.json(
      { error: "Nom du représentant légal requis." },
      { status: 400 },
    );
  }
  if (!isSignatureVect(body.signature)) {
    await rollback();
    return NextResponse.json({ error: "Signature manquante." }, { status: 400 });
  }

  if (!adherent.reglement_url) {
    await rollback();
    return NextResponse.json(
      { error: "Document d'origine introuvable." },
      { status: 422 },
    );
  }
  const path = storagePathFromUrl(adherent.reglement_url);
  if (!path) {
    await rollback();
    return NextResponse.json(
      { error: "Chemin du document illisible." },
      { status: 422 },
    );
  }
  const dossier = path.slice(0, path.lastIndexOf("/"));
  const ts = new Date().toISOString().replace(/[:.]/g, "-");
  const backupPath = `${dossier}/backup/reglement.pre-resign-${ts}.pdf`;

  // 4) BACKUP AVANT ÉCRASEMENT — on n'écrase pas tant que la copie n'est pas OK.
  const { error: cpErr } = await supabase.storage
    .from(STORAGE_BUCKET)
    .copy(path, backupPath);
  if (cpErr) {
    await rollback();
    return NextResponse.json(
      { error: "Sauvegarde impossible : " + cpErr.message },
      { status: 500 },
    );
  }

  // 5) Régénération au nom ACTUEL + remplacement au MÊME chemin storage.
  const nowIso = new Date().toISOString();
  try {
    const buf = await renderReglementPdf({
      nom: adherent.nom,
      prenom: adherent.prenom,
      mineur,
      responsable: mineur ? responsable : null,
      signature: body.signature,
      dateSignature: nowIso,
    });
    const { error: upErr } = await supabase.storage
      .from(STORAGE_BUCKET)
      .upload(path, buf, { contentType: "application/pdf", upsert: true });
    if (upErr) throw new Error(upErr.message);
  } catch (e) {
    await rollback();
    console.error("Régénération règlement:", e);
    return NextResponse.json(
      { error: "La régénération du document a échoué." },
      { status: 500 },
    );
  }

  // 6) Trace en base : nouvel horodatage + IP réelle, responsable persisté.
  //    (Le flag est déjà à false via le claim.)
  await supabase
    .from("adherents")
    .update({
      reglement_signee_at: nowIso,
      signature_ip: clientIp(request),
      ...(mineur ? { responsable } : {}),
    })
    .eq("id", id);

  // 7) Mails de confirmation (best-effort, spécifiques au document — pas de
  //    « tout est à jour » : si la fiche était aussi demandée, elle sera
  //    confirmée séparément au lot 4b).
  const dateFr = new Intl.DateTimeFormat("fr-FR", {
    dateStyle: "long",
    timeStyle: "short",
  }).format(new Date());
  try {
    const envois: Promise<unknown>[] = [
      sendReSignatureConfirmationAdmin({
        prenom: adherent.prenom ?? "",
        nom: adherent.nom ?? "",
        docLabel: "le règlement intérieur",
        date: dateFr,
        adherentId: id,
      }),
    ];
    if (adherent.email) {
      envois.push(
        sendReSignatureConfirmationAdherent({
          prenom: adherent.prenom ?? "",
          email: adherent.email,
          docLabel: "le règlement intérieur",
        }),
      );
    }
    await Promise.all(envois);
  } catch (e) {
    console.error("Mails re-signature (ignoré):", e);
  }

  return NextResponse.json({ received: true, doc: "reglement" });
}
