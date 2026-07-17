-- ============================================================================
-- 004 — MODÈLES D'EMAILS : colonne `personnalise` + GEL des modèles existants.
--
-- À EXÉCUTER sur une base DÉJÀ DÉPLOYÉE (ex. Punching Boxe) EN MÊME TEMPS que le
-- déploiement du code qui rend les modèles par défaut NEUTRES et fait que la
-- route /api/admin/templates met à jour les défauts non personnalisés.
--
-- ⚠️ INDISSOCIABLE DU CODE : sans ce fichier, le nouveau code écraserait les
-- modèles d'emails existants (ex. les textes boxe de Punching Boxe) par les
-- modèles neutres. Le GEL ci-dessous marque les modèles actuels comme
-- « personnalisés » → la synchro ne les touchera JAMAIS. Résultat : le club
-- conserve ses modèles à l'identique.
--
--   Supabase → SQL Editor → coller ce fichier → Run.
--
-- Idempotent. Pour un NOUVEAU client, la colonne existe déjà (001) et la table
-- des modèles est vide au moment de l'exécution → ce fichier ne fait rien de
-- visible, et les modèles neutres seront seedés ensuite (personnalise = false,
-- donc bénéficiant des futures mises à jour du socle).
-- ============================================================================

-- 1) Colonne (no-op si déjà présente via 001). NOT NULL default false : les
--    lignes existantes reçoivent automatiquement false.
alter table public.templates_mail
  add column if not exists personnalise boolean not null default false;

-- 2) GEL : tout modèle par défaut déjà en base est considéré comme figé par le
--    club → jamais réécrit par la synchro des défauts neutres du socle.
update public.templates_mail
  set personnalise = true
  where est_defaut is true;
