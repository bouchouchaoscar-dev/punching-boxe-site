import { renderDocument, pdfHeaders } from "@/lib/pdf/render";

export const runtime = "nodejs";

export async function GET() {
  const { body, filename } = await renderDocument("reglement");
  return new Response(body, { headers: pdfHeaders(filename) });
}
