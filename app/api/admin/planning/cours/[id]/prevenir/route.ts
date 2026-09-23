import { NextResponse } from "next/server";
import { getSupabaseAdmin, isSupabaseConfigured } from "@/lib/supabase";
import { isAdminRequest } from "@/lib/admin-guard";
import { envoyerCampagne, statutCampagne, enregistrerEnvois } from "@/lib/envoi-campagne";
import { estActifCompte } from "@/lib/adherents-actifs";
import { saisonCourante } from "@/lib/saison";
import { planningActif, adherentDansDiscipline, disciplineLabel, type Cours } from "@/lib/planning";
import type { Adherent } from "@/lib/types";

export const runtime = "nodejs";

type Ctx = { params: Promise<{ id: string }> };

// Sélectionne les adhérents ACTIFS de la saison courante concernés par la
// discipline du cours, croisés avec le public (type_adherent) du cours.
function adherentsCibles(adherents: Adherent[], cours: Cours): Adherent[] {
  const saisonRef = saisonCourante(new Date());
  const disc = cours.discipline ?? "";
  return adherents.filter((a) => {
    if (!(estActifCompte(a) && a.saison === saisonRef)) return false; // actif saison courante
    if (!adherentDansDiscipline(a.package, !!a.option_prepa_physique, disc)) return false; // discipline
    if (cours.type_adherent && a.type_adherent !== cours.type_adherent) return false; // public du cours
    return true;
  });
}

// POST — « prévenir les adhérents d'un cours ». preview:true → renvoie juste le
// comptage de la cible ; sinon envoie via envoyerCampagne (pacing, anti-doublon,
// exclusions RGPD/bounce) et historise en campagne.
export async function POST(request: Request, { params }: Ctx) {
  if (!planningActif()) return NextResponse.json({ error: "Module désactivé." }, { status: 404 });
  if (!isAdminRequest(request)) return NextResponse.json({ error: "Non autorisé." }, { status: 401 });
  if (!isSupabaseConfigured()) return NextResponse.json({ error: "Supabase non configuré." }, { status: 503 });

  const { id } = await params;
  let body: { objet?: string; contenu?: string; preview?: boolean };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Corps invalide." }, { status: 400 });
  }

  const supabase = getSupabaseAdmin();
  const { data: coursRow } = await supabase.from("cours").select("*").eq("id", id).maybeSingle();
  if (!coursRow) return NextResponse.json({ error: "Cours introuvable." }, { status: 404 });
  const cours = coursRow as Cours;

  const { data: adhData } = await supabase.from("adherents").select("*");
  const cibles = adherentsCibles((adhData ?? []) as Adherent[], cours);
  const emails = [...new Set(cibles.map((a) => (a.email || "").trim().toLowerCase()).filter(Boolean))];

  // Aperçu : comptage seul, aucun envoi.
  if (body.preview) {
    return NextResponse.json({
      count: cibles.length,
      emails: emails.length,
      discipline: disciplineLabel(cours.discipline),
    });
  }

  const objet = (body.objet || "").trim();
  const contenu = (body.contenu || "").trim();
  if (!objet || !contenu) return NextResponse.json({ error: "Objet et message requis." }, { status: 400 });
  if (emails.length === 0) return NextResponse.json({ error: "Aucun adhérent concerné." }, { status: 400 });

  // Envoi via le pipeline campagnes (manualEmails → dédoublonnage familial +
  // exclusions désinscrits/bounce + pacing + retry 429).
  const res = await envoyerCampagne(supabase, { objet, contenu, manualEmails: emails });
  if (!res.ok && res.emailsEnvoyes === 0 && res.error) {
    const status = /destinataire/i.test(res.error) ? 400 : res.error.includes("RESEND") ? 503 : 400;
    return NextResponse.json({ error: res.error }, { status });
  }

  // Historise comme campagne (type='campagne').
  const cible = `Cours : ${cours.libelle ?? "—"} (${disciplineLabel(cours.discipline)})`;
  const insertPayload: Record<string, unknown> = {
    titre: objet.slice(0, 200),
    objet,
    contenu,
    type: "campagne",
    cible,
    liste_type: "planning_cours",
    liste_filtre: { cours_id: id, discipline: cours.discipline, public: cours.type_adherent },
    nb_destinataires: res.personnesCiblees,
    nb_envoyes: res.emailsEnvoyes,
    nb_exclus: res.exclus + res.exclusSansEmail,
    statut: statutCampagne(res),
    envoye_at: new Date().toISOString(),
    destinataires_liste: res.destinatairesListe,
  };
  const colonnesOptionnelles = ["destinataires_liste", "type", "cible", "nb_envoyes", "nb_exclus"];
  let insErr: { message: string } | null = null;
  let campagneId: string | null = null;
  for (;;) {
    const { data, error } = await supabase.from("campagnes").insert(insertPayload).select("id").single();
    insErr = error;
    if (!insErr) { campagneId = data?.id ?? null; break; }
    const offending = colonnesOptionnelles.find((k) => insErr!.message.includes(k));
    if (!offending) break;
    delete insertPayload[offending];
  }
  if (insErr) console.error("Insert campagne (planning):", insErr);
  await enregistrerEnvois(supabase, campagneId, res.resultats);

  return NextResponse.json({
    success: res.emailsEnvoyes > 0,
    emails: res.emailsEnvoyes,
    personnes: res.personnesCiblees,
    exclus: res.exclus,
    exclusSansEmail: res.exclusSansEmail,
  });
}
