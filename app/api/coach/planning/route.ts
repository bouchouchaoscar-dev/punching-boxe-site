import { NextResponse } from "next/server";
import { getSupabaseAdmin, isSupabaseConfigured } from "@/lib/supabase";
import { hasRole } from "@/lib/admin-guard";
import { planningActif, type Cours, type Affectation, type PeriodeFermeture, type Prof } from "@/lib/planning";

export const runtime = "nodejs";

const ISO = /^\d{4}-\d{2}-\d{2}$/;

// GET — planning d'une semaine en LECTURE SEULE pour les coachs (et l'admin).
// Données STRICTEMENT nécessaires à l'affichage : cours actifs (libellé,
// discipline, public, jour, horaire, salle, ville), prénoms/noms des profs
// affectés, périodes de fermeture. JAMAIS d'emails, téléphones, adhérents,
// envois, montants. Fail-closed.
export async function GET(request: Request) {
  if (!planningActif()) return NextResponse.json({ error: "Module désactivé." }, { status: 404 });
  if (!hasRole(request, ["coach", "admin"])) {
    return NextResponse.json({ error: "Accès refusé." }, { status: 401 });
  }
  if (!isSupabaseConfigured()) return NextResponse.json({ cours: [], affectations: [], profs: [], periodes: [] });

  const semaine = new URL(request.url).searchParams.get("semaine") || "";
  if (!ISO.test(semaine)) return NextResponse.json({ error: "Semaine invalide." }, { status: 400 });

  const supabase = getSupabaseAdmin();
  const [{ data: coursRows }, { data: affRows }, { data: profRows }, { data: perRows }] = await Promise.all([
    supabase
      .from("cours")
      .select("id, actif, libelle, discipline, type_adherent, jour_semaine, heure_debut, heure_fin, salle, ville")
      .eq("actif", true),
    supabase.from("affectations").select("cours_id, prof_id, semaine, statut").eq("semaine", semaine),
    supabase.from("profs").select("id, prenom, nom"), // AUCUN email / téléphone
    supabase.from("periodes_fermeture").select("id, libelle, date_debut, date_fin"),
  ]);

  // Normalise pour le composant partagé (champs non demandés → neutres/absents).
  const cours = (coursRows ?? []).map((c) => ({ ...c, package: null, avec_prepa: false })) as Cours[];
  const profs = (profRows ?? []).map((p) => ({ ...p, actif: true, email: null, telephone: null })) as Prof[];
  const affectations = (affRows ?? []) as Affectation[];
  const periodes = (perRows ?? []) as PeriodeFermeture[];

  return NextResponse.json(
    { cours, affectations, profs, periodes },
    { headers: { "Cache-Control": "no-store" } },
  );
}
