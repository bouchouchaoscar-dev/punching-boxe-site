import { renderToBuffer } from "@react-pdf/renderer";
import { FicheInscriptionDoc } from "./FicheInscription";
import { CertificatMedicalDoc } from "./CertificatMedical";
import { ReglementInterieurDoc } from "./ReglementInterieur";
import type { FicheData, ReglementData } from "./types";

export type DocKey = "fiche" | "certificat" | "reglement";

const DOCS = {
  fiche: { node: <FicheInscriptionDoc />, filename: "fiche-inscription-punching-boxe.pdf" },
  certificat: { node: <CertificatMedicalDoc />, filename: "certificat-medical-punching-boxe.pdf" },
  reglement: { node: <ReglementInterieurDoc />, filename: "reglement-interieur-punching-boxe.pdf" },
} as const;

export async function renderDocument(key: DocKey): Promise<{
  body: Blob;
  filename: string;
}> {
  const def = DOCS[key];
  const buffer = await renderToBuffer(def.node);
  const body = new Blob([new Uint8Array(buffer)], { type: "application/pdf" });
  return { body, filename: def.filename };
}

// Rendu des documents REMPLIS + signés (inscription en ligne). Renvoie un
// Buffer prêt à uploader dans le bucket.
export async function renderFichePdf(data: FicheData): Promise<Buffer> {
  return renderToBuffer(<FicheInscriptionDoc data={data} />);
}
export async function renderReglementPdf(data: ReglementData): Promise<Buffer> {
  return renderToBuffer(<ReglementInterieurDoc data={data} />);
}

export function pdfHeaders(filename: string, inline = true): HeadersInit {
  return {
    "Content-Type": "application/pdf",
    "Content-Disposition": `${inline ? "inline" : "attachment"}; filename="${filename}"`,
    "Cache-Control": "public, max-age=3600",
  };
}
