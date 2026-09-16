/**
 * SUPPRESSION SÉCURISÉE d'un dossier adhérent DOUBLON (vide, sans argent).
 *
 * N'agit QUE sur l'id ciblé, et UNIQUEMENT si les 4 vérifications passent :
 *   1) le doublon existe et a bien nom='Benamar' prenom='Ayden' ;
 *   2) 0 ligne dans `paiements` (aucun argent) — STOP sinon ;
 *   3) dossier vide : non annulé, engage_at null, echeances_payees=0 ;
 *   4) le dossier à conserver existe et est le MÊME enfant
 *      (nom/prenom/date_naissance/email/titulaire_id identiques).
 * Sécurités additionnelles : 0 ligne `remboursements`, aucun `profiles` pointant
 * le doublon (FK sans cascade) — STOP sinon.
 *
 * STORAGE : les deux dossiers partagent la MÊME photo_url → le fichier n'est
 * JAMAIS supprimé (partagé avec le dossier conservé).
 *
 * IDEMPOTENT : si le doublon n'existe plus → « déjà supprimé, rien à faire ».
 *
 * Lancer : npx --yes tsx scripts/supprimer-doublon.mts
 * (ids par défaut = le cas Ayden Benamar ; overridables : ... <dupId> <keepId>)
 */
import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";
for (const l of readFileSync(".env.local", "utf8").split("\n")) {
  const m = l.match(/^([A-Z0-9_]+)=(.*)$/);
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
}
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

const DUP = (process.argv[2] ?? "62a8ecb1-2add-484b-b681-c1f855f27e6e").trim(); // à SUPPRIMER
const KEEP = (process.argv[3] ?? "917f9e91-a8c3-4e78-9570-464caa6a3a32").trim(); // à CONSERVER
const JAYDEN = "e8e0eff5-e87e-4879-a5dc-82274a146dd1"; // personne DIFFÉRENTE — à ne pas toucher

const bar = "─".repeat(60);
const log = (...a: unknown[]) => console.log(...a);
const stop = (msg: string) => { console.error(`\n❌ STOP : ${msg}\n   Aucune suppression effectuée.`); process.exit(1); };

log(bar); log(" SUPPRESSION DOUBLON — dup:", DUP, "| keep:", KEEP); log(bar);

const cols = "id, nom, prenom, date_naissance, email, titulaire_id, mode_paiement, statut_paiement, echeances_payees, engage_at, annule_at, photo_url";

// Comptage Benamar AVANT (pour le récap).
const { data: benaAvant } = await sb.from("adherents").select("id, prenom, nom").ilike("nom", "%benamar%");
log(`\n[AVANT] dossiers 'Benamar' en base : ${benaAvant?.length ?? 0}`);
for (const b of benaAvant ?? []) log(`   - ${b.prenom} ${b.nom} [${b.id}]`);

// Charger le doublon.
const { data: dup } = await sb.from("adherents").select(cols).eq("id", DUP).maybeSingle();

// IDEMPOTENCE : déjà supprimé ?
if (!dup) {
  log(`\n✅ Doublon ${DUP} introuvable → déjà supprimé, rien à faire.`);
  const { data: keepChk } = await sb.from("adherents").select("id, prenom, nom").eq("id", KEEP).maybeSingle();
  log(`   Dossier conservé ${KEEP} : ${keepChk ? "présent ✓" : "ABSENT ⚠️"}`);
  process.exit(0);
}

// ── VÉRIF 1 : identité du doublon ───────────────────────────────────────────
if (dup.nom !== "Benamar" || dup.prenom !== "Ayden") {
  stop(`le dossier ${DUP} n'est pas 'Ayden Benamar' (trouvé: ${dup.prenom} ${dup.nom}).`);
}
log("\n✓ Vérif 1 : doublon = Ayden Benamar.");

// ── VÉRIF 2 : 0 paiement (argent) ───────────────────────────────────────────
const { data: pays } = await sb.from("paiements").select("id, montant, statut").eq("adherent_id", DUP);
if ((pays?.length ?? 0) > 0) {
  stop(`le doublon porte ${pays!.length} ligne(s) paiements (argent rattaché) — ${JSON.stringify(pays)}.`);
}
log("✓ Vérif 2 : 0 ligne paiements (aucun argent).");

// ── VÉRIF 3 : dossier vide ──────────────────────────────────────────────────
if (dup.annule_at || dup.engage_at || (dup.echeances_payees ?? 0) !== 0) {
  stop(`dossier non vide (annule_at=${dup.annule_at}, engage_at=${dup.engage_at}, echeances_payees=${dup.echeances_payees}).`);
}
log("✓ Vérif 3 : dossier vide (non annulé, non engagé, 0 échéance payée).");

// ── VÉRIF 4 : le dossier à conserver est le MÊME enfant ─────────────────────
const { data: keep } = await sb.from("adherents").select(cols).eq("id", KEEP).maybeSingle();
if (!keep) stop(`le dossier à CONSERVER ${KEEP} est introuvable.`);
const memeEnfant =
  keep!.nom === dup.nom && keep!.prenom === dup.prenom &&
  keep!.date_naissance === dup.date_naissance && keep!.email === dup.email &&
  keep!.titulaire_id === dup.titulaire_id;
if (!memeEnfant) {
  stop(`le dossier conservé n'est pas le même enfant (nom/prenom/naissance/email/titulaire diffèrent).`);
}
log("✓ Vérif 4 : dossier conservé = même enfant (nom/prénom/naissance/email/titulaire identiques).");

// ── Sécurités dépendances (FK) ──────────────────────────────────────────────
const { data: rembs } = await sb.from("remboursements").select("id").eq("adherent_id", DUP);
if ((rembs?.length ?? 0) > 0) stop(`le doublon a ${rembs!.length} remboursement(s) rattaché(s).`);
const { data: profs } = await sb.from("profiles").select("id").eq("adherent_id", DUP);
if ((profs?.length ?? 0) > 0) stop(`un profil (compte espace) pointe le doublon (${profs!.length}) — lien à traiter avant suppression.`);
log("✓ Sécurités : 0 remboursement, 0 profil lié.");

// Storage : photo partagée avec le dossier conservé → NON supprimée.
const photoPartagee = keep!.photo_url === dup.photo_url;
log(`✓ Storage : photo ${photoPartagee ? "PARTAGÉE avec le dossier conservé → non touchée" : "distincte (non touchée par prudence)"}.`);

// ── SUPPRESSION (adherents ; paiements/remboursements en cascade — ici 0) ───
const { error: delErr } = await sb.from("adherents").delete().eq("id", DUP);
if (delErr) stop(`échec suppression : ${delErr.message}`);
log(`\n🗑️  Dossier doublon ${DUP} supprimé.`);

// ── RÉCAP APRÈS ─────────────────────────────────────────────────────────────
const { data: benaApres } = await sb.from("adherents").select("id, prenom, nom").ilike("nom", "%benamar%");
const { data: keepApres } = await sb.from("adherents").select(cols).eq("id", KEEP).maybeSingle();
const { data: jayden } = await sb.from("adherents").select("id, prenom, nom, statut_paiement").eq("id", JAYDEN).maybeSingle();

log("\n" + bar);
log(`[APRÈS] dossiers 'Benamar' : ${benaApres?.length ?? 0} (attendu 1)`);
for (const b of benaApres ?? []) log(`   - ${b.prenom} ${b.nom} [${b.id}]`);
log(`\nDossier conservé ${KEEP} : ${keepApres ? "INTACT ✓" : "ABSENT ⚠️"}`);
if (keepApres) log(`   ${keepApres.prenom} ${keepApres.nom} | ${keepApres.date_naissance} | ${keepApres.email} | ${keepApres.mode_paiement}/${keepApres.statut_paiement}`);
log(`Dossier Jayden (autre personne) ${JAYDEN} : ${jayden ? "INTACT ✓ (non touché)" : "ABSENT ⚠️"}`);
log(bar);
process.exit(0);
