import { renderFichePdf, renderReglementPdf } from "@/lib/pdf/render";
import type { FicheData, ReglementData } from "@/lib/pdf/types";

export const runtime = "nodejs";

// Aperçu AVANT signature : rend la fiche / le règlement REMPLIS avec les
// données RÉELLES de l'adhérent, mais SANS signature (case vide) et SANS
// upload. Sert à afficher le document à vérifier dans la modale de signature.
// Données personnelles → on force no-store (pas de cache).
function pdfResponse(buf: Buffer, filename: string) {
  return new Response(new Uint8Array(buf), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="${filename}"`,
      "Cache-Control": "no-store, max-age=0",
    },
  });
}

export async function POST(request: Request) {
  let body: { doc?: string; fiche?: FicheData; reglement?: ReglementData };
  try {
    body = await request.json();
  } catch {
    return new Response("Requête invalide", { status: 400 });
  }

  try {
    if (body.doc === "reglement") {
      const r = body.reglement;
      if (!r) return new Response("Données manquantes", { status: 400 });
      const buf = await renderReglementPdf({
        nom: r.nom,
        prenom: r.prenom,
        mineur: r.mineur,
        responsable: r.responsable,
        signature: null,
        dateSignature: null,
      });
      return pdfResponse(buf, "apercu-reglement.pdf");
    }

    const f = body.fiche;
    if (!f) return new Response("Données manquantes", { status: 400 });
    const buf = await renderFichePdf({ ...f, signature: null, dateSignature: null });
    return pdfResponse(buf, "apercu-fiche.pdf");
  } catch {
    return new Response("Erreur de génération", { status: 500 });
  }
}
