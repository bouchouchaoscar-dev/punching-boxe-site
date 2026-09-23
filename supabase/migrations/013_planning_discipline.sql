-- 013 — [Planning] Un cours est une DISCIPLINE, pas une formule d'adhésion.
-- Correction de modèle : le cours portait package + avec_prepa (logique des
-- FORMULES D'ADHÉSION), ce qui est faux. Un cours = une discipline enseignée :
--   'boxe_francaise' | 'savate' | 'prepa_physique'.
-- Le mailing « prévenir les adhérents d'un cours » cible ensuite les FORMULES
-- d'adhésion qui incluent cette discipline (recoupement prépa géré côté code).
--
-- ADDITIF & non destructif : on GARDE package/avec_prepa en base (rien ne casse),
-- mais `discipline` devient le champ de référence du planning.

alter table public.cours
  add column if not exists discipline text
  check (discipline in ('boxe_francaise','savate','prepa_physique'));

-- BACKFILL des cours existants au mieux depuis l'ancien package :
--   boxe_classique → boxe_francaise ; savate_prepa → savate.
-- (avec_prepa ne suffit pas à décider « prépa » sans ambiguïté : un cours
--  Boxe+Prépa devient boxe_francaise ; à repasser en 'prepa_physique' À LA MAIN
--  s'il s'agissait en réalité d'une séance de prépa.)
update public.cours set discipline = 'boxe_francaise'
  where discipline is null and package = 'boxe_classique';
update public.cours set discipline = 'savate'
  where discipline is null and package = 'savate_prepa';

notify pgrst, 'reload schema';
