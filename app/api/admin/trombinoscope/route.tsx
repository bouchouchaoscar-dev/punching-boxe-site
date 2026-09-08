import { renderToBuffer } from "@react-pdf/renderer";
import { getSupabaseAdmin, isSupabaseConfigured } from "@/lib/supabase";
import { isAdminRequest } from "@/lib/admin-guard";
import { estActifCompte } from "@/lib/adherents-actifs";
import { statutTrombi } from "@/lib/paiement";
import { formuleLabel } from "@/lib/pricing";
import { formaterPrenom, formaterNom } from "@/lib/noms";
import { TrombinoscopeDoc, type TrombiMembre } from "@/lib/pdf/Trombinoscope";
import type { Adherent } from "@/lib/types";

export const runtime = "nodejs";

const initiales = (prenom: string, nom: string) =>
  `${(prenom || "").trim()[0] ?? ""}${(nom || "").trim()[0] ?? ""}`.toUpperCase() ||
  "?";

async function photoDataUri(url: string | null): Promise<string | null> {
  if (!url) return null;
  try {
    const ctrl = new AbortController();
    const to = setTimeout(() => ctrl.abort(), 8000);
    const res = await fetch(url, { signal: ctrl.signal });
    clearTimeout(to);
    if (!res.ok) return null;
    const type = res.headers.get("content-type") || "image/jpeg";
    if (!type.startsWith("image/")) return null;
    const b64 = Buffer.from(await res.arrayBuffer()).toString("base64");
    return `data:${type};base64,${b64}`;
  } catch {
    return null;
  }
}

async function pool<T, R>(
  items: T[],
  n: number,
  fn: (t: T) => Promise<R>,
): Promise<R[]> {
  const out = new Array<R>(items.length);
  let i = 0;
  await Promise.all(
    Array.from({ length: Math.min(n, items.length) }, async () => {
      while (i < items.length) {
        const idx = i++;
        out[idx] = await fn(items[idx]);
      }
    }),
  );
  return out;
}

// POST — génère le trombinoscope PDF pour la liste d'adhérents EXACTEMENT
// affichée par la vue (filtres appliqués côté client → liste d'ids transmise).
// À défaut d'ids, retombe sur tous les actifs (de la saison éventuelle).
export async function POST(request: Request) {
  if (!isAdminRequest(request)) {
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

  const supabase = getSupabaseAdmin();
  const { data } = await supabase.from("adherents").select("*");
  let actifs = ((data ?? []) as Adherent[]).filter(estActifCompte);

  if (ids) {
    const set = new Set(ids);
    actifs = actifs.filter((a) => set.has(a.id)); // ∩ actifs (sécurité serveur)
  } else if (saison && saison !== "all") {
    actifs = actifs.filter((a) => a.saison === saison);
  }

  actifs.sort(
    (a, b) =>
      (a.nom || "").localeCompare(b.nom || "", "fr", { sensitivity: "base" }) ||
      (a.prenom || "").localeCompare(b.prenom || "", "fr", {
        sensitivity: "base",
      }),
  );

  const photos = await pool(actifs, 8, (a) => photoDataUri(a.photo_url));

  const membres: TrombiMembre[] = actifs.map((a, i) => {
    const st = statutTrombi(a);
    return {
      nom: formaterNom(a.nom),
      prenom: formaterPrenom(a.prenom),
      formule: formuleLabel(a.package, a.option_prepa_physique),
      statutLabel: st.label,
      statutCouleur: st.couleur,
      photo: photos[i],
      initiales: initiales(a.prenom, a.nom),
    };
  });

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
