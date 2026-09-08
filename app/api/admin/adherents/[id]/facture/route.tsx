import { isSupabaseConfigured } from "@/lib/supabase";
import { isAdminRequest } from "@/lib/admin-guard";
import { construireFacturePdf } from "@/lib/pdf/facture-gen";

export const runtime = "nodejs";

type Ctx = { params: Promise<{ id: string }> };

// GET — facture/attestation d'un adhérent, côté ADMIN. Auth = admin (Bearer
// mot de passe). Même document que côté adhérent : on appelle la fonction
// partagée construireFacturePdf (source unique) sans callback d'autorisation
// (l'admin est déjà gardé par isAdminRequest).
export async function GET(request: Request, { params }: Ctx) {
  const { id } = await params;
  if (!isAdminRequest(request)) {
    return new Response(JSON.stringify({ error: "Non autorisé." }), {
      status: 401,
    });
  }
  if (!isSupabaseConfigured()) {
    return new Response(JSON.stringify({ error: "Service indisponible." }), {
      status: 503,
    });
  }

  const res = await construireFacturePdf(id);
  if (!res.ok) {
    return new Response(JSON.stringify({ error: res.error }), {
      status: res.status,
    });
  }

  return new Response(new Uint8Array(res.buffer), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="${res.filename}"`,
      "Cache-Control": "no-store",
    },
  });
}
