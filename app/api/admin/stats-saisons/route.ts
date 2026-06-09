import { NextResponse } from "next/server";
import { getSupabaseAdmin, isSupabaseConfigured } from "@/lib/supabase";
import { isAdminRequest } from "@/lib/admin-guard";
import { saisonCourante } from "@/lib/saison";

export const runtime = "nodejs";

type Disc = { BF: number; SAVATE: number; LES_2: number; AUTRE: number };
const discVide = (): Disc => ({ BF: 0, SAVATE: 0, LES_2: 0, AUTRE: 0 });

async function paginate(
  supabase: ReturnType<typeof getSupabaseAdmin>,
  table: string,
  cols: string,
) {
  let all: any[] = [];
  let from = 0;
  for (;;) {
    const { data } = await supabase.from(table).select(cols).range(from, from + 999);
    if (!data || !data.length) break;
    all = all.concat(data);
    if (data.length < 1000) break;
    from += 1000;
  }
  return all;
}

// Discipline principale d'une ligne d'historique (1 par ligne → somme = effectifs).
function discPrincipale(d: string[] | null): keyof Disc {
  const arr = d ?? [];
  if (arr.includes("LES_2")) return "LES_2";
  if (arr.includes("SAVATE")) return "SAVATE";
  if (arr.includes("BF")) return "BF";
  return "AUTRE";
}

export async function GET(request: Request) {
  if (!isAdminRequest(request)) {
    return NextResponse.json({ error: "Non autorisé." }, { status: 401 });
  }
  if (!isSupabaseConfigured()) {
    return NextResponse.json({ saisonCourante: "", seasons: [], serie: [] });
  }
  const supabase = getSupabaseAdmin();
  const courante = saisonCourante(new Date());

  // --- Saisons PASSÉES : historique_saisons ---
  const hist = await paginate(supabase, "historique_saisons", "saison, montant, disciplines");
  const histBySaison = new Map<string, { ca: number; eff: number; disc: Disc }>();
  for (const h of hist) {
    const s = h.saison as string;
    if (!s) continue;
    let agg = histBySaison.get(s);
    if (!agg) { agg = { ca: 0, eff: 0, disc: discVide() }; histBySaison.set(s, agg); }
    agg.ca += Number(h.montant || 0);
    agg.eff += 1;
    agg.disc[discPrincipale(h.disciplines)] += 1;
  }

  // --- Saisons PRÉSENT/FUTUR : adherents (dossiers ACTIFS) ---
  const adh = await paginate(
    supabase,
    "adherents",
    "saison, montant_total, statut_paiement, engage_at, package",
  );
  const natifBySaison = new Map<string, { ca: number; eff: number; disc: Disc }>();
  for (const a of adh) {
    const s = a.saison as string;
    if (!s) continue;
    const actif =
      a.statut_paiement === "paye" ||
      a.statut_paiement === "confirme_especes" ||
      !!a.engage_at;
    if (!actif) continue;
    let agg = natifBySaison.get(s);
    if (!agg) { agg = { ca: 0, eff: 0, disc: discVide() }; natifBySaison.set(s, agg); }
    agg.ca += Number(a.montant_total || 0);
    agg.eff += 1;
    if (a.package === "savate_prepa") agg.disc.SAVATE += 1;
    else agg.disc.BF += 1;
  }

  // --- Union des saisons + série (source choisie par la règle passé/présent) ---
  const seasonsSet = new Set<string>([
    ...histBySaison.keys(),
    ...natifBySaison.keys(),
    courante,
  ]);
  const seasonsAsc = [...seasonsSet].sort();
  const serie = seasonsAsc.map((s) => {
    const past = s < courante;
    const src = (past ? histBySaison.get(s) : natifBySaison.get(s)) ?? {
      ca: 0,
      eff: 0,
      disc: discVide(),
    };
    return {
      saison: s,
      source: past ? "historique" : "natif",
      ca: Math.round(src.ca),
      effectifs: src.eff,
      disciplines: src.disc,
      enCours: s === courante,
    };
  });

  return NextResponse.json({
    saisonCourante: courante,
    seasons: [...seasonsSet].sort().reverse(), // pour le sélecteur (récent en 1er)
    serie,
  });
}
