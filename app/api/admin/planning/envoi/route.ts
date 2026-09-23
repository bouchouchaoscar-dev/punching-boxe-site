import { NextResponse } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import { getSupabaseAdmin, isSupabaseConfigured } from "@/lib/supabase";
import { isAdminRequest } from "@/lib/admin-guard";
import { sendPlanningProf } from "@/lib/email";
import {
  planningActif,
  planningProfSemaine,
  diffEnvoiDetaille,
  libelleChangements,
  jourLong,
  dateDuJour,
  toISODate,
  type Cours,
  type Prof,
  type Affectation,
  type PeriodeFermeture,
  type CoursEnvoi,
  type StatutEnvoi,
  type DiffDetaille,
} from "@/lib/planning";

export const runtime = "nodejs";

const ISO = /^\d{4}-\d{2}-\d{2}$/;

// Ligne lisible d'un cours pour le mail : "Lundi 3 mars, 18:00 à 19:30, Libellé, Salle".
function ligneCours(c: CoursEnvoi): string {
  const dateFr = new Date(c.date).toLocaleDateString("fr-FR", { day: "numeric", month: "long" });
  const horaire = c.horaire.replace(" – ", " à ");
  const lieu = [c.salle, c.ville].filter(Boolean).join(", ");
  return `${jourLong(c.jour)} ${dateFr}, ${horaire}, ${c.libelle}${lieu ? `, ${lieu}` : ""}`;
}

type Ligne = {
  prof_id: string;
  nom: string;
  email: string | null;
  statut: StatutEnvoi;
  nbCours: number;
  actuel: CoursEnvoi[];
  diff: DiffDetaille;
};

// Objet + en-tête selon le contenu du diff.
function sujetTitre(l: Ligne, semaineLabel: string): { subject: string; titre: string } {
  if (l.statut === "maj") {
    const txt = libelleChangements(l.diff.ajoutes.length, l.diff.retires.length, l.diff.modifies.length);
    return { titre: "Mise à jour de votre planning", subject: `Mise à jour de votre planning : ${txt}` };
  }
  // nouveau + plus_de_cours
  return { titre: "Votre planning de la semaine", subject: `Votre planning — semaine du ${semaineLabel}` };
}

// Calcule, pour chaque prof concerné cette semaine, son statut d'envoi.
async function calculer(supabase: SupabaseClient, semaine: string): Promise<Ligne[]> {
  const [{ data: coursRows }, { data: affRows }, { data: perRows }, { data: profRows }, { data: envRows }] =
    await Promise.all([
      supabase.from("cours").select("*").eq("actif", true),
      supabase.from("affectations").select("*").eq("semaine", semaine),
      supabase.from("periodes_fermeture").select("*"),
      supabase.from("profs").select("*"),
      supabase.from("envois_planning").select("*").eq("semaine", semaine),
    ]);
  const cours = (coursRows as Cours[] | null) ?? [];
  const affectations = (affRows as Affectation[] | null) ?? [];
  const periodes = (perRows as PeriodeFermeture[] | null) ?? [];
  const profs = (profRows as Prof[] | null) ?? [];
  const snaps = new Map<string, CoursEnvoi[]>();
  for (const e of envRows ?? []) snaps.set(e.prof_id as string, (e.snapshot as CoursEnvoi[]) ?? []);

  // Profs concernés = ceux affectés cette semaine ∪ ceux ayant déjà reçu un envoi.
  const ids = new Set<string>();
  for (const a of affectations) if (a.prof_id) ids.add(a.prof_id);
  for (const id of snaps.keys()) ids.add(id);

  const profById = new Map(profs.map((p) => [p.id, p]));
  const lignes: Ligne[] = [];
  for (const id of ids) {
    const p = profById.get(id);
    if (!p) continue;
    const actuel = planningProfSemaine(id, cours, affectations, semaine, periodes);
    const diff = diffEnvoiDetaille(actuel, snaps.get(id) ?? null);
    lignes.push({
      prof_id: id,
      nom: [p.prenom, p.nom].filter(Boolean).join(" ") || "Prof",
      email: p.email,
      statut: diff.statut,
      nbCours: actuel.length,
      actuel,
      diff,
    });
  }
  return lignes;
}

const aEnvoyer = (s: StatutEnvoi) => s === "nouveau" || s === "maj" || s === "plus_de_cours";

// GET — aperçu : ?semaine=. Renvoie les profs à notifier (statut lisible).
export async function GET(request: Request) {
  if (!planningActif()) return NextResponse.json({ error: "Module désactivé." }, { status: 404 });
  if (!isAdminRequest(request)) return NextResponse.json({ error: "Non autorisé." }, { status: 401 });
  if (!isSupabaseConfigured()) return NextResponse.json({ profs: [], aEnvoyer: 0 });
  const semaine = new URL(request.url).searchParams.get("semaine") || "";
  if (!ISO.test(semaine)) return NextResponse.json({ error: "Semaine invalide." }, { status: 400 });

  const lignes = await calculer(getSupabaseAdmin(), semaine);
  const cibles = lignes.filter((l) => aEnvoyer(l.statut));
  return NextResponse.json({
    aEnvoyer: cibles.length,
    profs: cibles.map((l) => ({
      prof_id: l.prof_id,
      nom: l.nom,
      sansEmail: !l.email,
      statut: l.statut,
      nbCours: l.nbCours,
    })),
  });
}

// POST — envoie les plannings à jour et enregistre le snapshot par prof.
// Idempotent : un renvoi immédiat retrouve "identique" → aucun mail.
export async function POST(request: Request) {
  if (!planningActif()) return NextResponse.json({ error: "Module désactivé." }, { status: 404 });
  if (!isAdminRequest(request)) return NextResponse.json({ error: "Non autorisé." }, { status: 401 });
  if (!isSupabaseConfigured()) return NextResponse.json({ error: "Supabase non configuré." }, { status: 503 });

  let body: { semaine?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Corps invalide." }, { status: 400 });
  }
  const semaine = (body.semaine || "").trim();
  if (!ISO.test(semaine)) return NextResponse.json({ error: "Semaine invalide." }, { status: 400 });

  const supabase = getSupabaseAdmin();
  const lignes = await calculer(supabase, semaine);
  const semaineLabel = dateDuJour(semaine, 1).toLocaleDateString("fr-FR", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });

  let envoyes = 0;
  let sansEmail = 0;
  for (const l of lignes) {
    if (!aEnvoyer(l.statut)) continue;
    if (!l.email) {
      sansEmail++;
      // On enregistre quand même le snapshot pour ne pas re-signaler indéfiniment.
      await supabase
        .from("envois_planning")
        .upsert(
          { prof_id: l.prof_id, semaine, snapshot: l.actuel, envoye_at: new Date().toISOString() },
          { onConflict: "prof_id,semaine" },
        );
      continue;
    }
    try {
      const ajoutesIds = new Set(l.diff.ajoutes.map((c) => c.cours_id));
      const modifiesIds = new Set(l.diff.modifies.map((m) => m.apres.cours_id));
      const { subject, titre } = sujetTitre(l, semaineLabel);
      await sendPlanningProf({
        email: l.email,
        prenomProf: l.nom.split(" ")[0],
        subject,
        titre,
        semaineLabel,
        planning: l.actuel.map((c) => ({
          texte: ligneCours(c),
          badge: ajoutesIds.has(c.cours_id) ? "nouveau" : modifiesIds.has(c.cours_id) ? "modifie" : undefined,
        })),
        ajoutes: l.diff.ajoutes.map(ligneCours),
        retires: l.diff.retires.map(ligneCours),
        modifies: l.diff.modifies.map((m) => ({ avant: ligneCours(m.avant), apres: ligneCours(m.apres) })),
        plusDeCours: l.statut === "plus_de_cours",
      });
      // Snapshot APRÈS envoi réussi → idempotence (re-clic = identique = rien).
      await supabase
        .from("envois_planning")
        .upsert(
          { prof_id: l.prof_id, semaine, snapshot: l.actuel, envoye_at: new Date().toISOString() },
          { onConflict: "prof_id,semaine" },
        );
      envoyes++;
    } catch (e) {
      console.error("sendPlanningProf:", e);
    }
  }

  return NextResponse.json({ success: true, envoyes, sansEmail });
}
