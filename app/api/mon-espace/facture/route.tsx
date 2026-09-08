import { getAuthUser } from "@/lib/auth-server";
import { isSupabaseConfigured } from "@/lib/supabase";
import { construireFacturePdf } from "@/lib/pdf/facture-gen";

export const runtime = "nodejs";

// GET — facture/attestation de l'adhérent CONNECTÉ. Auth = session ; le rendu et
// les données viennent de la fonction partagée construireFacturePdf (source
// unique). L'adhérent ne peut générer QUE son dossier (authorize titulaire).
export async function GET(request: Request) {
  if (!isSupabaseConfigured()) {
    return new Response(JSON.stringify({ error: "Service indisponible." }), {
      status: 503,
    });
  }
  const user = await getAuthUser(request);
  if (!user) {
    return new Response(JSON.stringify({ error: "Non authentifié." }), {
      status: 401,
    });
  }

  const adherentId = new URL(request.url).searchParams.get("adherentId") || "";
  const res = await construireFacturePdf(
    adherentId,
    (a) => a.titulaire_id === user.id,
  );
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
