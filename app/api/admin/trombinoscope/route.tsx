import { renderToBuffer } from "@react-pdf/renderer";
import { isSupabaseConfigured } from "@/lib/supabase";
import { hasRole } from "@/lib/admin-guard";
import {
  chargerActifsTrombi,
  chargerPhotos,
  toMembrePublic,
} from "@/lib/trombi-server";
import { TrombinoscopeDoc } from "@/lib/pdf/Trombinoscope";

export const runtime = "nodejs";

// POST — génère le trombinoscope PDF. Coach ET admin (le PDF ne contient que
// photo + nom + formule + statut, aucune donnée sensible). L'admin transmet la
// liste d'ids EXACTEMENT affichée (filtres client) ; le coach n'a pas d'ids →
// retombe sur tous les actifs de la saison éventuelle.
export async function POST(request: Request) {
  if (!hasRole(request, ["coach", "admin"])) {
    return new Response(JSON.stringify({ error: "Non autorisé." }), {
      status: 401,
    });
  }
  if (!isSupabaseConfigured()) {
    return new Response(JSON.stringify({ error: "Supabase non configuré." }), {
      status: 503,
    });
  }

  let body: { ids?: string[]; saison?: string } = {};
  try {
    body = await request.json();
  } catch {
    /* corps optionnel */
  }
  const ids = Array.isArray(body.ids) ? body.ids : null;
  const saison = body.saison || "";

  const actifs = await chargerActifsTrombi({ ids, saison });
  const photos = await chargerPhotos(actifs);
  const membres = actifs.map((a, i) => toMembrePublic(a, photos[i]));

  const dateFr = new Intl.DateTimeFormat("fr-FR", { dateStyle: "long" }).format(
    new Date(),
  );
  const libSaison = saison && saison !== "all" ? saison : "toutes saisons";

  const buffer = await renderToBuffer(
    <TrombinoscopeDoc saison={libSaison} date={dateFr} membres={membres} />,
  );

  return new Response(new Uint8Array(buffer), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="trombinoscope-punching-boxe.pdf"`,
      "Cache-Control": "no-store",
    },
  });
}
