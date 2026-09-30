import { renderToBuffer } from "@react-pdf/renderer";
import QRCode from "qrcode";
import { getSupabaseAdmin, isSupabaseConfigured } from "@/lib/supabase";
import { isAdminRequest } from "@/lib/admin-guard";
import { presenceActif, slugSalle } from "@/lib/presence";
import { chargerPlanning } from "@/lib/presence-server";
import { pdfHeaders } from "@/lib/pdf/render";
import { AfficheQRDoc } from "@/lib/pdf/AfficheQR";
import { SITE_URL } from "@/lib/constants";

export const runtime = "nodejs";

// GET /api/admin/presence/affiche?salle=<slug> — PDF A4 avec le QR de pointage.
// Sans `salle` → affiche générique (QR vers /presence sans salle).
export async function GET(request: Request) {
  if (!presenceActif()) return new Response("Module désactivé.", { status: 404 });
  if (!isAdminRequest(request)) return new Response("Non autorisé.", { status: 401 });
  if (!isSupabaseConfigured()) return new Response("Indisponible.", { status: 503 });

  const slug = new URL(request.url).searchParams.get("salle") || "";

  // Nom lisible de la salle depuis le planning (chaîne libre cours.salle).
  let salleNom: string | null = null;
  if (slug) {
    const { cours } = await chargerPlanning(getSupabaseAdmin());
    const trouve = cours.find((c) => c.salle && slugSalle(c.salle) === slug);
    salleNom = trouve?.salle ?? null;
    if (!salleNom) return new Response("Salle inconnue.", { status: 404 });
  }

  const url = slug
    ? `${SITE_URL}/presence?salle=${encodeURIComponent(slug)}`
    : `${SITE_URL}/presence`;
  const qrDataUri = await QRCode.toDataURL(url, { margin: 1, width: 520, errorCorrectionLevel: "M" });

  const buffer = await renderToBuffer(<AfficheQRDoc data={{ salle: salleNom, url, qrDataUri }} />);
  const nom = slug ? `affiche-presence-${slug}.pdf` : "affiche-presence.pdf";
  return new Response(new Uint8Array(buffer), { headers: pdfHeaders(nom) });
}
