import { NextResponse } from "next/server";
import { getSupabaseAdmin, isSupabaseConfigured } from "@/lib/supabase";
import { isAdminRequest } from "@/lib/admin-guard";
import { TARIFS, PACKAGE_LABEL, type PackageType } from "@/lib/pricing";
import { saisonCourante } from "@/lib/saison";
import { SITE_URL } from "@/lib/constants";
import { sendActivationDossier } from "@/lib/email";
import type { SupabaseClient } from "@supabase/supabase-js";

export const runtime = "nodejs";

type Body = {
  nom?: string;
  prenom?: string;
  email?: string;
  package?: string;
  type_adherent?: string;
  nouveau_membre?: boolean;
  cotisation_libre?: number;
  date_debut?: string;
  date_fin?: string;
};

const PACKAGES = Object.keys(PACKAGE_LABEL) as PackageType[];
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const isDate = (s: string) => /^\d{4}-\d{2}-\d{2}$/.test(s) && !isNaN(Date.parse(s));

// Retrouve l'id d'un compte auth par email (pagination). supabase-js n'expose
// pas de lookup direct par email.
async function trouverUserIdParEmail(
  supabase: SupabaseClient,
  email: string,
): Promise<string | null> {
  const cible = email.toLowerCase();
  for (let page = 1; page <= 20; page++) {
    const { data, error } = await supabase.auth.admin.listUsers({
      page,
      perPage: 200,
    });
    if (error || !data) break;
    const u = data.users.find((x) => (x.email ?? "").toLowerCase() === cible);
    if (u) return u.id;
    if (data.users.length < 200) break;
  }
  return null;
}

// POST — création ADMIN d'un dossier à TARIF LIBRE + DURÉE LIBRE + réservation
// du compte adhérent (activation par lien). Admin only, serveur autoritaire :
// le montant vient de la saisie admin, écrit DIRECTEMENT (jamais calculerTarif
// ni evaluerAnciennete). Le parcours d'inscription standard reste inchangé.
export async function POST(request: Request) {
  if (!isAdminRequest(request)) {
    return NextResponse.json({ error: "Non autorisé." }, { status: 401 });
  }
  if (!isSupabaseConfigured()) {
    return NextResponse.json({ error: "Supabase non configuré." }, { status: 503 });
  }
  // La création d'un compte auth exige la clé service_role (auth.admin.*).
  if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
    return NextResponse.json(
      { error: "Clé service_role requise côté serveur." },
      { status: 503 },
    );
  }

  let body: Body;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Corps invalide." }, { status: 400 });
  }

  // --- Validation (serveur autoritaire) ---
  const nom = (body.nom || "").trim();
  const prenom = (body.prenom || "").trim();
  const email = (body.email || "").trim().toLowerCase();
  const pkg = body.package as PackageType;
  const type_adherent = body.type_adherent;
  const nouveau_membre = body.nouveau_membre === true;
  const cotisation = Number(body.cotisation_libre);
  const date_debut = (body.date_debut || "").trim();
  const date_fin = (body.date_fin || "").trim();

  if (!nom || !prenom) {
    return NextResponse.json({ error: "Nom et prénom requis." }, { status: 400 });
  }
  if (!EMAIL_RE.test(email)) {
    return NextResponse.json({ error: "Email invalide." }, { status: 400 });
  }
  if (!PACKAGES.includes(pkg)) {
    return NextResponse.json({ error: "Formule invalide." }, { status: 400 });
  }
  if (type_adherent !== "adulte" && type_adherent !== "jeune") {
    return NextResponse.json({ error: "Type d'adhérent invalide." }, { status: 400 });
  }
  if (!Number.isFinite(cotisation) || cotisation <= 0) {
    return NextResponse.json({ error: "Montant invalide." }, { status: 400 });
  }
  if (!isDate(date_debut) || !isDate(date_fin)) {
    return NextResponse.json({ error: "Dates invalides." }, { status: 400 });
  }
  if (Date.parse(date_fin) <= Date.parse(date_debut)) {
    return NextResponse.json(
      { error: "La date de fin doit être après la date de début." },
      { status: 400 },
    );
  }

  // Montant autoritaire : cotisation libre + adhésion 30 € si case cochée.
  // JAMAIS via calculerTarif/evaluerAnciennete.
  const montant_total =
    Math.round((cotisation + (nouveau_membre ? TARIFS.adhesion : 0)) * 100) / 100;
  const saison = saisonCourante(new Date(date_debut));

  const supabase = getSupabaseAdmin();

  // --- Compte auth : réutiliser s'il existe, sinon créer (sans mot de passe) ---
  let userId: string;
  let compteCree = false;
  const { data: created } = await supabase.auth.admin.createUser({
    email,
    email_confirm: true, // pas d'email Supabase ; activation via notre lien
  });
  if (created?.user) {
    userId = created.user.id;
    compteCree = true;
  } else {
    const existant = await trouverUserIdParEmail(supabase, email);
    if (!existant) {
      return NextResponse.json(
        { error: "Impossible de créer ou retrouver le compte pour cet email." },
        { status: 500 },
      );
    }
    userId = existant;
  }

  // --- Insert du dossier (titulaire_id posé d'emblée) ---
  // date_naissance reste NULL : renseignée par l'adhérent lors de la complétion
  // (Lot 4). Nécessite date_naissance nullable (migration 006).
  const { data: inserted, error: insErr } = await supabase
    .from("adherents")
    .insert({
      nom,
      prenom,
      email,
      type_adherent,
      package: pkg,
      nouveau_membre,
      montant_total,
      statut_paiement: "en_attente",
      saison,
      date_debut,
      date_fin,
      tarif_libre: true,
      titulaire_id: userId,
    })
    .select("id")
    .single();

  if (insErr || !inserted) {
    return NextResponse.json(
      { error: "Création du dossier impossible : " + (insErr?.message ?? "") },
      { status: 500 },
    );
  }

  // --- Lien d'activation (définition du mot de passe) → notre mail Resend ---
  // 'recovery' fonctionne que le compte vienne d'être créé ou préexiste, et
  // mène à /auth/reset-password (flux existant), SANS email Supabase.
  let mailEnvoye = false;
  const { data: linkData } = await supabase.auth.admin.generateLink({
    type: "recovery",
    email,
    options: { redirectTo: `${SITE_URL}/auth/reset-password` },
  });
  const lien = linkData?.properties?.action_link;
  if (lien) {
    try {
      const res = await sendActivationDossier({ prenom, email, lien });
      mailEnvoye = !(res as { skipped?: boolean })?.skipped;
    } catch (e) {
      console.error("Mail activation (ignoré):", e);
    }
  }

  return NextResponse.json({
    success: true,
    adherentId: inserted.id,
    compteCree,
    mailEnvoye,
  });
}
