-- 019 — Changement de formule : le mode de règlement du supplément peut être
-- « à régler par l'adhérent » (mode non encore choisi ; l'adhérent choisira carte
-- ou espèces depuis son espace). On étend la contrainte de mode_reglement.

begin;

alter table public.changements_formule
  drop constraint if exists changements_formule_mode_reglement_check;

alter table public.changements_formule
  add constraint changements_formule_mode_reglement_check
  check (mode_reglement in
    ('a_regler','carte','especes','offert','remboursement_carte','remboursement_hors_ligne'));

commit;

notify pgrst, 'reload schema';
