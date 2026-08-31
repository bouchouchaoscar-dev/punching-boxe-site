import { NextResponse } from "next/server";
import { verifyResignatureToken, type ResignDoc } from "@/lib/resignature-link";
import { getSupabaseAdmin, isSupabaseConfigured } from "@/lib/supabase";

export const runtime = "nodejs";

// LOT 3 — STUB. Accuse réception d'une re-signature (200) SANS régénérer les PDF
// et SANS remettre les flags *_a_resigner à false. Vérifie tout de même le token
// HMAC scopé + que le document est bien flaggé « à re-signer ». La régénération
// réelle (backup + render + remplacement + maj signee_at/IP + flags) = LOT 4,
// qui remplacera le corps de ce handler.
export async function POST(request: Request) {
  let body: {
    a?: string;
    doc?: string;
    exp?: string;
    t?: string;
    docToSign?: string;
    // signature + responsable reçus mais NON traités au lot 3 (lot 4).
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

  // 2) Document demandé cohérent avec le scope du token.
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

  // 3) Le document doit être réellement flaggé « à re-signer » (relu en base).
  const supabase = getSupabaseAdmin();
  const { data } = await supabase
    .from("adherents")
    .select("id, fiche_a_resigner, reglement_a_resigner")
    .eq("id", verified.adherentId)
    .maybeSingle();
  if (!data) {
    return NextResponse.json({ error: "Dossier introuvable." }, { status: 404 });
  }
  const flagged =
    docToSign === "fiche" ? data.fiche_a_resigner : data.reglement_a_resigner;
  if (!flagged) {
    return NextResponse.json(
      { error: "Aucune re-signature demandée pour ce document." },
      { status: 409 },
    );
  }

  // 4) STUB : on ne régénère RIEN et on ne touche PAS les flags. Accusé de
  //    réception uniquement. (Lot 4 : régénération + remplacement + flags=false.)
  return NextResponse.json({ received: true, stub: true, doc: docToSign });
}
