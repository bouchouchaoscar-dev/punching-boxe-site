import { NextResponse } from "next/server";
import { getSupabaseAdmin, isSupabaseConfigured } from "@/lib/supabase";
import { isAdminRequest } from "@/lib/admin-guard";
import { saisonCourante } from "@/lib/saison";
import { classerAncien, type ClasseAncien } from "@/lib/anciennete";

export const runtime = "nodejs";

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

// GET — consultation des anciens adhérents (liste + fiche/historique).
export async function GET(request: Request) {
  if (!isAdminRequest(request)) {
    return NextResponse.json({ error: "Non autorisé." }, { status: 401 });
  }
  if (!isSupabaseConfigured()) {
    return NextResponse.json({ saisonCourante: "", anciens: [] });
  }
  const supabase = getSupabaseAdmin();
  const courante = saisonCourante(new Date());

  const personnes = await paginate(
    supabase,
    "anciens_adherents",
    "id, nom, prenom, email, telephone, ville, a_verifier",
  );
  const hist = await paginate(
    supabase,
    "historique_saisons",
    "ancien_id, saison, disciplines, montant",
  );

  const histByAncien = new Map<
    string,
    { saison: string; disciplines: string[]; montant: number | null }[]
  >();
  for (const h of hist) {
    const arr = histByAncien.get(h.ancien_id) ?? [];
    arr.push({
      saison: h.saison,
      disciplines: h.disciplines ?? [],
      montant: h.montant == null ? null : Number(h.montant),
    });
    histByAncien.set(h.ancien_id, arr);
  }

  const anciens = personnes
    .map((p) => {
      const h = (histByAncien.get(p.id) ?? []).sort((a, b) =>
        b.saison.localeCompare(a.saison),
      );
      const derniere = h.length ? h[0].saison : null;
      const disciplines = [...new Set(h.flatMap((x) => x.disciplines))];
      const totalPaye = h.reduce((s, x) => s + (x.montant ?? 0), 0);
      const classe: ClasseAncien | null = classerAncien(derniere, courante);
      return {
        id: p.id,
        nom: p.nom,
        prenom: p.prenom,
        email: p.email,
        telephone: p.telephone,
        ville: p.ville,
        a_verifier: !!p.a_verifier,
        derniere_saison: derniere,
        classe,
        disciplines,
        nb_saisons: h.length,
        total_paye: Math.round(totalPaye),
        historique: h,
      };
    })
    .sort((a, b) =>
      `${a.nom} ${a.prenom}`.localeCompare(`${b.nom} ${b.prenom}`, "fr"),
    );

  return NextResponse.json({ saisonCourante: courante, anciens });
}
