import { renderToBuffer } from "@react-pdf/renderer";
import QRCode from "qrcode";
import { getSupabaseAdmin, isSupabaseConfigured } from "@/lib/supabase";
import { isAdminRequest } from "@/lib/admin-guard";
import { presenceActif, slugSalle } from "@/lib/presence";
import { chargerPlanning } from "@/lib/presence-server";
import { AfficheQRDoc } from "@/lib/pdf/AfficheQR";
import { urlPresence } from "@/lib/site-url";

export const runtime = "nodejs";
// Toujours régénérée (jamais servie depuis un cache statique/CDN) : le PDF change
// quand l'affiche évolue, et le nom de fichier est horodaté (voir plus bas).
export const dynamic = "force-dynamic";
export const revalidate = 0;

// Horodatage AAAAMMJJ-HHmm (pour un nom de fichier unique à chaque téléchargement).
function horodatage(d = new Date()): string {
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}`;
}

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

  // URL absolue canonique (NEXT_PUBLIC_SITE_URL) — fail-closed si absente : on
  // n'imprime JAMAIS un QR vers une URL de déploiement Vercel.
  const url = urlPresence(slug || null);
  if (!url) {
    return new Response(
      "Configuration manquante : NEXT_PUBLIC_SITE_URL doit être définie (URL canonique du site) pour générer le QR.",
      { status: 503 },
    );
  }
  const qrDataUri = await QRCode.toDataURL(url, { margin: 1, width: 520, errorCorrectionLevel: "M" });

  const buffer = await renderToBuffer(<AfficheQRDoc data={{ salle: salleNom, qrDataUri }} />);
  const nom = `affiche-presence-${slug || "generique"}-${horodatage()}.pdf`;
  // no-store : jamais mis en cache (navigateur ni CDN Vercel) → toujours la
  // dernière version de l'affiche.
  return new Response(new Uint8Array(buffer), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="${nom}"`,
      "Cache-Control": "no-store, no-cache, must-revalidate, max-age=0",
    },
  });
}
