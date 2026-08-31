import { renderToBuffer } from "@react-pdf/renderer";
import { getSupabaseAdmin, isSupabaseConfigured } from "@/lib/supabase";
import { isAdminRequest } from "@/lib/admin-guard";
import { estActifCompte } from "@/lib/adherents-actifs";
import { estPaiementSolde } from "@/lib/paiement";
import { formuleLabel } from "@/lib/pricing";
import { TrombinoscopeDoc, type TrombiMembre } from "@/lib/pdf/Trombinoscope";
import type { Adherent } from "@/lib/types";

export const runtime = "nodejs";

const initiales = (prenom: string, nom: string) =>
  `${(prenom || "").trim()[0] ?? ""}${(nom || "").trim()[0] ?? ""}`.toUpperCase() ||
  "?";

// Récupère une photo et la renvoie en data-URI (embarquable dans le PDF).
// Timeout + tolérance : toute erreur → null (placeholder initiales).
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

// Traite `items` avec au plus `n` tâches en parallèle (évite un timeout et une
// surcharge mémoire avec beaucoup de photos).
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

export async function GET(request: Request) {
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

  const saison = new URL(request.url).searchParams.get("saison") || "";

  const supabase = getSupabaseAdmin();
  const { data } = await supabase.from("adherents").select("*");
  let actifs = ((data ?? []) as Adherent[]).filter(estActifCompte);
  if (saison && saison !== "all") {
    actifs = actifs.filter((a) => a.saison === saison);
  }
  // Tri par NOM de famille A→Z (puis prénom), insensible casse/accents.
  actifs.sort(
    (a, b) =>
      (a.nom || "").localeCompare(b.nom || "", "fr", { sensitivity: "base" }) ||
      (a.prenom || "").localeCompare(b.prenom || "", "fr", {
        sensitivity: "base",
      }),
  );

  // Photos embarquées (concurrence limitée à 8).
  const photos = await pool(actifs, 8, (a) => photoDataUri(a.photo_url));

  const membres: TrombiMembre[] = actifs.map((a, i) => ({
    nom: a.nom,
    prenom: a.prenom,
    formule: formuleLabel(a.package, a.option_prepa_physique),
    paye: estPaiementSolde(a),
    photo: photos[i],
    initiales: initiales(a.prenom, a.nom),
  }));

  const dateFr = new Intl.DateTimeFormat("fr-FR", { dateStyle: "long" }).format(
    new Date(),
  );
  const libSaison = saison && saison !== "all" ? saison : "toutes saisons";

  const buffer = await renderToBuffer(
    <TrombinoscopeDoc saison={libSaison} date={dateFr} membres={membres} />,
  );

  const nomFichier = `trombinoscope-${(saison && saison !== "all" ? saison : "actifs").replace(/[^\w-]/g, "-")}.pdf`;
  return new Response(new Uint8Array(buffer), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="${nomFichier}"`,
      "Cache-Control": "no-store",
    },
  });
}
