import { NextResponse } from "next/server";
import { getSupabaseAdmin, isSupabaseConfigured } from "@/lib/supabase";
import { isAdminRequest } from "@/lib/admin-guard";
import { envoyerCampagne, statutCampagne, enregistrerEnvois } from "@/lib/envoi-campagne";
import { resoudreOuverture, type PersonneEnvoi } from "@/lib/campagnes";
import { estActifCompte } from "@/lib/adherents-actifs";
import { estMineur } from "@/lib/pricing";
import { saisonCourante } from "@/lib/saison";
import {
  planningActif,
  adherentDansDiscipline,
  disciplineLabel,
  formatDateCours,
  plageHoraire,
  formatLieu,
  type Cours,
} from "@/lib/planning";
import type { Adherent } from "@/lib/types";

export const runtime = "nodejs";

type Ctx = { params: Promise<{ id: string }> };

type Creneau = {
  dateISO?: string | null;
  heure_debut?: string | null;
  heure_fin?: string | null;
  salle?: string | null;
  ville?: string | null;
};
type Apercu = { motif: "annule" | "deplace" | "reporte"; origine: Creneau; nouveau?: Creneau };

// Encadré HTML « Avant / Désormais » (confiance serveur), seulement pour les
// éléments qui changent (date, horaire, lieu). Aligné visuellement sur le bloc
// « Cours modifié » des mails profs.
function construireBlocApercu(a: Apercu): string {
  if (a.motif === "annule" || !a.nouveau) return "";
  const o = a.origine;
  const n = a.nouveau;
  const rows: { label: string; avant: string; apres: string }[] = [];

  if (n.dateISO && o.dateISO && n.dateISO !== o.dateISO) {
    rows.push({ label: "Date", avant: formatDateCours(o.dateISO), apres: formatDateCours(n.dateISO) });
  }
  const oh = plageHoraire(o.heure_debut ?? null, o.heure_fin ?? null);
  const nh = plageHoraire(n.heure_debut ?? o.heure_debut ?? null, n.heure_fin ?? o.heure_fin ?? null);
  if (oh && nh && oh !== nh) rows.push({ label: "Horaire", avant: oh, apres: nh });

  const ol = formatLieu(o.salle, o.ville);
  const nl = formatLieu(n.salle ?? o.salle, n.ville ?? o.ville);
  if (nl && ol !== nl) rows.push({ label: "Lieu", avant: ol || "—", apres: nl });

  if (rows.length === 0) return "";
  const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  const lignes = rows
    .map(
      (r) =>
        `<p style="margin:6px 0;line-height:1.5"><strong style="color:#0a0a0a">${r.label} :</strong> <span style="color:#999;text-decoration:line-through">${esc(r.avant)}</span> <span style="color:#b45309;font-weight:700">→ ${esc(r.apres)}</span></p>`,
    )
    .join("");
  return `<div style="border:1px solid #fde3c4;background:#fff8f0;border-radius:12px;padding:14px;margin:16px 0">
    <p style="margin:0 0 6px;font-weight:700;color:#b45309">Avant / Désormais</p>${lignes}</div>`;
}

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
  let body: { objet?: string; contenu?: string; preview?: boolean; apercu?: Apercu };
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

  // Regroupement par email (familles) → ouverture adaptée majeur/mineur/foyer.
  const groupes = new Map<string, Adherent[]>();
  for (const a of cibles) {
    const e = (a.email || "").trim().toLowerCase();
    if (!e) continue;
    const arr = groupes.get(e);
    if (arr) arr.push(a);
    else groupes.set(e, [a]);
  }

  // Aperçu : comptage + exemples d'ouverture résolus (dont un cas mineur/foyer).
  if (body.preview) {
    const ex = [...groupes.values()].map((membres) => {
      const ouv = resoudreOuverture(membres.map((a) => ({ prenom: a.prenom, mineur: estMineur(a.date_naissance) })));
      const special = membres.length > 1 || membres.some((a) => estMineur(a.date_naissance));
      return { special, texte: ouv.concerne ? `${ouv.salutation} ${ouv.concerne}` : ouv.salutation };
    });
    ex.sort((a, b) => Number(b.special) - Number(a.special)); // met en avant un cas mineur/foyer
    const exemples = [...new Set(ex.map((e) => e.texte))].slice(0, 3);
    return NextResponse.json({
      count: cibles.length,
      emails: emails.length,
      discipline: disciplineLabel(cours.discipline),
      exemples,
    });
  }

  const objet = (body.objet || "").trim();
  const contenu = (body.contenu || "").trim();
  if (!objet || !contenu) return NextResponse.json({ error: "Objet et message requis." }, { status: 400 });
  if (emails.length === 0) return NextResponse.json({ error: "Aucun adhérent concerné." }, { status: 400 });

  // Encadré « Avant / Désormais » (facultatif, construit serveur depuis l'aperçu).
  const blocHtml = body.apercu ? construireBlocApercu(body.apercu) : "";

  // Personnes ciblées passées DIRECTEMENT → regroupées par email (familles,
  // ouverture majeur/mineur/foyer) par envoyerCampagne. Anti-doublon par personKey.
  const saisonRef = saisonCourante(new Date());
  const manualPersonnes: PersonneEnvoi[] = cibles
    .filter((a) => (a.email || "").trim())
    .map((a) => ({
      personKey: `natif:${a.id}`,
      email: (a.email || "").trim().toLowerCase(),
      prenom: a.prenom,
      nom: a.nom,
      mineur: estMineur(a.date_naissance),
      saison: a.saison || saisonRef,
    }));

  // Envoi via le pipeline campagnes (dédoublonnage familial + exclusions
  // désinscrits/bounce + pacing + retry 429).
  const res = await envoyerCampagne(supabase, { objet, contenu, manualPersonnes, blocHtml });
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
    type: "planning_cours",
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
