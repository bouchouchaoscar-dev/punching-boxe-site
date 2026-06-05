/**
 * Seed de données de test — table `adherents`.
 *
 *   npm run seed
 *
 * Insère 10 adhérents fictifs variés (adultes/jeunes, statuts, packages,
 * options, dates sept.-oct. 2026). Utilise SUPABASE_SERVICE_ROLE_KEY pour
 * contourner RLS. Auto-contenu (aucun import depuis @/lib).
 *
 * Nettoyage : supprimer les lignes dont l'email finit par "@example.com".
 */
import { createClient } from "@supabase/supabase-js";
import fs from "node:fs";
import path from "node:path";

// ---- Chargement manuel de .env.local (ts-node ne le fait pas) ----
function loadEnv() {
  const file = path.join(process.cwd(), ".env.local");
  if (!fs.existsSync(file)) return;
  for (const line of fs.readFileSync(file, "utf8").split("\n")) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (!m) continue;
    const key = m[1];
    let val = m[2].trim();
    if (
      (val.startsWith('"') && val.endsWith('"')) ||
      (val.startsWith("'") && val.endsWith("'"))
    ) {
      val = val.slice(1, -1);
    }
    if (!process.env[key]) process.env[key] = val;
  }
}
loadEnv();

const URL = process.env.NEXT_PUBLIC_SUPABASE_URL || "";
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || "";

if (!URL || !KEY) {
  console.error(
    "❌ NEXT_PUBLIC_SUPABASE_URL et SUPABASE_SERVICE_ROLE_KEY requis (dans .env.local).",
  );
  process.exit(1);
}

const SAISON = "2026-2027";

type Pkg = "boxe_classique" | "savate_forme";
type TypeAdh = "adulte" | "jeune";
type Statut = "paye" | "en_attente" | "confirme_especes";
type Mode = "stripe_1x" | "stripe_2x" | "stripe_3x" | "stripe_4x" | "especes";

// ---- Logique tarifaire (miroir de lib/pricing.ts) ----
function remisePct(nbFamille: number): number {
  const rang = nbFamille + 1;
  if (rang >= 5) return 20;
  if (rang === 4) return 15;
  if (rang === 3) return 10;
  return 0;
}
function montant(
  pkg: Pkg,
  type: TypeAdh,
  nouveau: boolean,
  prepa: boolean,
  nbFamille: number,
): number {
  const cotis = type === "jeune" ? 410 : 430;
  const remise = Math.round((cotis * remisePct(nbFamille)) / 100);
  const adhesion = nouveau ? 30 : 0;
  const prepaCost = pkg === "boxe_classique" && prepa ? 100 : 0;
  return cotis - remise + adhesion + prepaCost;
}

type Seed = {
  nom: string;
  prenom: string;
  date_naissance: string;
  type: TypeAdh;
  package: Pkg;
  nouveau: boolean;
  prepa: boolean;
  nbFamille: number;
  statut: Statut;
  mode: Mode;
  created_at: string;
};

const SEEDS: Seed[] = [
  { nom: "Durand", prenom: "Marie", date_naissance: "1990-04-12", type: "adulte", package: "boxe_classique", nouveau: true, prepa: false, nbFamille: 0, statut: "en_attente", mode: "especes", created_at: "2025-09-04T10:15:00Z" },
  { nom: "Martin", prenom: "Lucas", date_naissance: "2014-06-23", type: "jeune", package: "boxe_classique", nouveau: true, prepa: true, nbFamille: 0, statut: "paye", mode: "stripe_1x", created_at: "2025-10-09T18:40:00Z" },
  { nom: "Bernard", prenom: "Sophie", date_naissance: "1985-11-02", type: "adulte", package: "savate_forme", nouveau: false, prepa: true, nbFamille: 0, statut: "paye", mode: "stripe_3x", created_at: "2025-11-15T09:05:00Z" },
  { nom: "Petit", prenom: "Hugo", date_naissance: "2015-01-30", type: "jeune", package: "boxe_classique", nouveau: false, prepa: false, nbFamille: 0, statut: "confirme_especes", mode: "especes", created_at: "2025-12-21T17:20:00Z" },
  { nom: "Leroy", prenom: "Emma", date_naissance: "1998-08-17", type: "adulte", package: "savate_forme", nouveau: true, prepa: true, nbFamille: 0, statut: "paye", mode: "stripe_2x", created_at: "2026-01-27T11:50:00Z" },
  { nom: "Moreau", prenom: "Nathan", date_naissance: "1992-03-08", type: "adulte", package: "boxe_classique", nouveau: true, prepa: true, nbFamille: 0, statut: "en_attente", mode: "especes", created_at: "2026-02-03T19:10:00Z" },
  { nom: "Simon", prenom: "Chloé", date_naissance: "2013-12-05", type: "jeune", package: "boxe_classique", nouveau: false, prepa: false, nbFamille: 2, statut: "paye", mode: "stripe_1x", created_at: "2026-03-08T16:35:00Z" },
  { nom: "Laurent", prenom: "Louis", date_naissance: "1979-07-19", type: "adulte", package: "savate_forme", nouveau: false, prepa: true, nbFamille: 0, statut: "confirme_especes", mode: "especes", created_at: "2026-04-14T20:00:00Z" },
  { nom: "Garcia", prenom: "Léa", date_naissance: "2001-05-28", type: "adulte", package: "boxe_classique", nouveau: true, prepa: false, nbFamille: 0, statut: "paye", mode: "stripe_4x", created_at: "2026-05-21T08:25:00Z" },
  { nom: "Roux", prenom: "Gabriel", date_naissance: "2014-09-14", type: "jeune", package: "savate_forme", nouveau: true, prepa: true, nbFamille: 0, statut: "en_attente", mode: "especes", created_at: "2026-06-04T18:55:00Z" },
];

async function main() {
  const supabase = createClient(URL, KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const rows = SEEDS.map((s, i) => {
    const total = montant(s.package, s.type, s.nouveau, s.prepa, s.nbFamille);
    return {
      nom: s.nom,
      prenom: s.prenom,
      date_naissance: s.date_naissance,
      email: `${s.prenom}.${s.nom}@example.com`.toLowerCase(),
      telephone: `06${String(10000000 + i * 1234567).slice(0, 8)}`,
      adresse: `${10 + i} rue des Tatamis`,
      ville: i % 2 === 0 ? "Nogent-sur-Marne" : "Le Perreux-sur-Marne",
      code_postal: i % 2 === 0 ? "94130" : "94170",
      type_adherent: s.type,
      package: s.package,
      nouveau_membre: s.nouveau,
      // En Savate & Forme la prépa est incluse → toujours true
      option_prepa_physique: s.package === "savate_forme" ? true : s.prepa,
      nb_membres_famille: s.nbFamille,
      montant_total: total,
      mode_paiement: s.mode,
      statut_paiement: s.statut,
      stripe_payment_intent_id: s.statut === "paye" ? `pi_seed_${i + 1}` : null,
      saison: SAISON,
      created_at: s.created_at,
      photo_url: null,
      fiche_inscription_url: null,
      certificat_medical_url: null,
      reglement_url: null,
    };
  });

  // Purge des anciennes lignes de test (idempotence : pas de doublons si re-seed).
  console.log("→ Purge des anciens adhérents de test (@example.com)…");
  const { error: delErr } = await supabase
    .from("adherents")
    .delete()
    .like("email", "%@example.com");
  if (delErr) {
    console.error("❌ Erreur de purge :", delErr.message);
    process.exit(1);
  }

  console.log(`→ Insertion de ${rows.length} adhérents de test…`);
  const { data, error } = await supabase
    .from("adherents")
    .insert(rows)
    .select("id, prenom, nom, montant_total");

  if (error) {
    console.error("❌ Erreur d'insertion :", error.message);
    if (/package/.test(error.message)) {
      console.error(
        "💡 La colonne `package` manque. Lancez d'abord dans Supabase :\n" +
          "   alter table public.adherents add column if not exists package text check (package in ('boxe_classique','savate_forme'));",
      );
    }
    process.exit(1);
  }

  console.log(`✅ ${data?.length ?? 0} adhérents insérés :`);
  for (const a of data ?? []) {
    console.log(`   - ${a.prenom} ${a.nom} : ${a.montant_total} €`);
  }
  console.log(
    "\nℹ️  Pour nettoyer : supprimer les lignes dont l'email finit par @example.com.",
  );
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
