// ============================================================================
// SEED NOUVEAU CLIENT — insère les 12 templates de mail par défaut (adaptés au
// club via config-client.json) + rappel admin. Idempotent (upsert par `nom`).
//   npx tsx scripts/seed-nouveau-client.mts
// Prérequis : NEXT_PUBLIC_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY (.env.local)
//             et le schéma déjà appliqué (001_schema_complet.sql).
// ============================================================================
import { readFileSync, existsSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";

for (const line of readFileSync(".env.local", "utf8").split("\n")) {
  const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
}
const cfg = existsSync("config-client.json") ? JSON.parse(readFileSync("config-client.json", "utf8")) : {};
const NOM = cfg.club?.nomCourt ?? "le club";
const SIGN = `\n\nÀ bientôt,\n${cfg.club?.directeur ?? "L'équipe"} et l'équipe du ${NOM}`;

const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

// Variables dispo : {{prenom}} {{nom}} {{formule}} {{montant}} {{saison}}
// {{derniere_saison}} {{disciplines}} {{recap_reglement}}
// Boutons : {{bouton_inscription}} {{bouton_espace}}
type T = { nom: string; objet: string; contenu: string; categorie: string };
const TEMPLATES: T[] = [
  { nom: "Bienvenue — compte créé", categorie: "informatif",
    objet: `Bienvenue au ${NOM} 🥊`,
    contenu: `Bonjour {{prenom}},\n\nBienvenue ! Votre espace adhérent est prêt. Vous pouvez finaliser votre inscription, déposer vos documents et suivre votre dossier à tout moment.\n\n{{bouton_espace}}${SIGN}` },
  { nom: "Relance certificat médical", categorie: "relance_admin",
    objet: "⚠️ Certificat médical manquant",
    contenu: `Bonjour {{prenom}},\n\nVotre dossier est presque complet ! Il nous manque votre certificat médical pour le finaliser. Déposez-le en quelques clics depuis votre espace.\n\n{{bouton_espace}}${SIGN}` },
  { nom: "Relance règlement espèces en attente", categorie: "relance_admin",
    objet: "💰 Règlement en attente",
    contenu: `Bonjour {{prenom}},\n\n{{recap_reglement}}\n\nPensez à régler en espèces auprès du professeur lors de votre prochain cours.${SIGN}` },
  { nom: "Document refusé à redéposer", categorie: "relance_admin",
    objet: "Une pièce de votre dossier est à corriger",
    contenu: `Bonjour {{prenom}},\n\nUne pièce de votre dossier doit être redéposée. Connectez-vous à votre espace pour voir le motif et la corriger.\n\n{{bouton_espace}}${SIGN}` },
  { nom: "Dossier complet et validé", categorie: "informatif",
    objet: "✅ Votre dossier est validé",
    contenu: `Bonjour {{prenom}},\n\nVotre dossier d'inscription est complet et validé. Tout est en ordre, vous êtes prêt(e) pour la saison {{saison}}. À bientôt à la salle !\n\n{{bouton_espace}}${SIGN}` },
  { nom: "Rappel échéance à venir", categorie: "informatif",
    objet: "Rappel — prochaine échéance",
    contenu: `Bonjour {{prenom}},\n\nVotre prochaine échéance sera bientôt prélevée sur la carte enregistrée. Aucune action n'est nécessaire si votre carte est à jour.\n\n{{bouton_espace}}${SIGN}` },
  { nom: "Réinscription — saison ouverte", categorie: "reinscription",
    objet: `Réinscriptions {{saison}} ouvertes !`,
    contenu: `Bonjour {{prenom}},\n\nLes réinscriptions pour la saison {{saison}} sont ouvertes. Reprenez votre place en quelques minutes, tout se fait en ligne.\n\n{{bouton_inscription}}${SIGN}` },
  { nom: "Réinscription — tarif anticipé", categorie: "reinscription",
    objet: "Réinscrivez-vous dès maintenant",
    contenu: `Bonjour {{prenom}},\n\nNe perdez pas votre place pour la saison {{saison}} : les réinscriptions anticipées sont ouvertes. Inscription 100% en ligne.\n\n{{bouton_inscription}}${SIGN}` },
  { nom: "Relance non réinscrits", categorie: "reinscription",
    objet: "Vous nous manquez pour {{saison}}",
    contenu: `Bonjour {{prenom}},\n\nVous étiez des nôtres en {{derniere_saison}} et nous serions ravis de vous retrouver pour la saison {{saison}}. Votre réinscription se fait en ligne en quelques minutes.\n\n{{bouton_inscription}}${SIGN}` },
  { nom: "Réactivation anciens (tièdes)", categorie: "reactivation",
    objet: "Et si vous repreniez la boxe ?",
    contenu: `Bonjour {{prenom}},\n\nCela fait un moment ! Le ${NOM} vous rouvre ses portes pour la saison {{saison}}. Reprise en douceur, tous niveaux. On vous attend.\n\n{{bouton_inscription}}${SIGN}` },
  { nom: "Réactivation anciens (éloignés)", categorie: "reactivation",
    objet: "On aimerait vous revoir au club",
    contenu: `Bonjour {{prenom}},\n\nVous avez fait partie du ${NOM} par le passé. Le club a évolué et l'inscription est désormais 100% en ligne. Au plaisir de vous revoir sur les rings !\n\n{{bouton_inscription}}${SIGN}` },
  { nom: "Message informatif", categorie: "informatif",
    objet: `Information — ${NOM}`,
    contenu: `Bonjour {{prenom}},\n\n[Votre message ici]\n\n{{bouton_espace}}${SIGN}` },
];

let ins = 0, maj = 0;
for (const t of TEMPLATES) {
  const { data: existing } = await sb.from("templates_mail").select("id").eq("nom", t.nom).maybeSingle();
  if (existing) {
    await sb.from("templates_mail").update({ objet: t.objet, contenu: t.contenu, categorie: t.categorie, est_defaut: true }).eq("id", existing.id);
    maj++;
  } else {
    await sb.from("templates_mail").insert({ ...t, est_defaut: true });
    ins++;
  }
}
console.log(`Templates mail : ${ins} insérés, ${maj} mis à jour (total ${TEMPLATES.length}).`);
console.log(`Admin : géré via l'environnement (NEXT_PUBLIC_ADMIN_USERNAME + ADMIN_PASSWORD). Rien à seeder en base.`);
console.log("✔ Seed terminé.");
