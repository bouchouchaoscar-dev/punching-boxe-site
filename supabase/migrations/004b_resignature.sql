-- 004 — Re-signature de documents depuis l'espace adhérent.
--
-- Permet à l'admin de demander une re-signature (fiche et/ou règlement) : le(s)
-- document(s) passent « à re-signer », l'adhérent re-signe, les PDF sont
-- régénérés au nom actuel + nouvel horodatage.
--
-- Rétrocompat STRICTE : toutes les colonnes ont un défaut (ou sont nullable) →
-- les dossiers déjà signés restent inchangés, le parcours d'inscription intact.
-- À exécuter dans Supabase → SQL Editor AVANT de déployer le code des lots suivants.

alter table public.adherents
  add column if not exists fiche_a_resigner        boolean not null default false,
  add column if not exists reglement_a_resigner    boolean not null default false,
  add column if not exists resignature_demandee_at timestamptz,
  add column if not exists responsable             text;

comment on column public.adherents.fiche_a_resigner is
  'Fiche d''inscription à re-signer (demande admin). Repasse à false après re-signature.';
comment on column public.adherents.reglement_a_resigner is
  'Règlement à re-signer (demande admin). Repasse à false après re-signature.';
comment on column public.adherents.resignature_demandee_at is
  'Horodatage de la demande de re-signature par l''admin.';
comment on column public.adherents.responsable is
  'Nom du représentant légal (mineur). Non stocké à l''inscription ; persisté à la re-signature.';
