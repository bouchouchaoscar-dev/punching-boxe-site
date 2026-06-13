import { renderFichePdf, renderReglementPdf, pdfHeaders } from "@/lib/pdf/render";
import type { FicheData, SignatureVect } from "@/lib/pdf/types";

export const runtime = "nodejs";

// Aperçu de test : rend la fiche / le règlement REMPLIS + SIGNÉS avec des
// données d'exemple (aucune PII réelle). Sert à valider le rendu PDF.
//   /api/documents/apercu?doc=fiche        (adulte)
//   /api/documents/apercu?doc=fiche&mineur=1
//   /api/documents/apercu?doc=reglement

// Signature dessinée d'exemple (scribble vectoriel).
const SAMPLE_SIG: SignatureVect = {
  width: 300,
  height: 100,
  strokes: [
    [
      { x: 12, y: 70 }, { x: 35, y: 28 }, { x: 58, y: 78 }, { x: 86, y: 24 },
      { x: 120, y: 74 }, { x: 150, y: 36 }, { x: 184, y: 70 }, { x: 215, y: 30 },
      { x: 250, y: 66 }, { x: 288, y: 42 },
    ],
    [{ x: 70, y: 88 }, { x: 240, y: 88 }],
  ],
};

const SAMPLE_FICHE = (mineur: boolean): FicheData => ({
  nom: "DURAND",
  prenom: "Marie",
  dateNaissance: mineur ? "2015-04-12" : "1992-04-12",
  telephone: "07 60 83 98 30",
  email: "marie.durand@example.com",
  adresse: "12 rue des Lilas",
  codePostal: "94130",
  ville: "Nogent-sur-Marne",
  packageType: "boxe_classique",
  optionPrepa: true,
  typeAdherent: mineur ? "jeune" : "adulte",
  montantTotal: 530,
  mineur,
  responsable: mineur ? "Sophie DURAND" : null,
  autorisationMedicale: mineur ? true : undefined,
  contacts: [
    { nom: "Sophie DURAND", tel: "06 12 34 56 78" },
    { nom: "Paul DURAND", tel: "06 98 76 54 32" },
  ],
  signature: SAMPLE_SIG,
  dateSignature: new Date().toISOString(),
});

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const doc = searchParams.get("doc") ?? "fiche";
  const mineur = searchParams.get("mineur") === "1";

  if (doc === "reglement") {
    const buf = await renderReglementPdf({
      nom: "DURAND",
      prenom: "Marie",
      signature: SAMPLE_SIG,
      dateSignature: new Date().toISOString(),
    });
    return new Response(new Uint8Array(buf), {
      headers: pdfHeaders("apercu-reglement.pdf"),
    });
  }

  const buf = await renderFichePdf(SAMPLE_FICHE(mineur));
  return new Response(new Uint8Array(buf), {
    headers: pdfHeaders("apercu-fiche.pdf"),
  });
}
