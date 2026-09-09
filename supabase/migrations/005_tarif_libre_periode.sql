-- 005 — Dossier à TARIF LIBRE + DURÉE LIBRE (créé par l'admin).
--
-- Cas d'exception : inscription courte / sur-mesure que la grille standard ne
-- prévoit pas. L'admin fixe un montant libre et une période (date début → fin).
-- La formule reste une formule EXISTANTE (les CHECK package/mode/statut/type
-- ne sont donc PAS touchés) ; le sur-mesure porte uniquement sur le MONTANT et
-- la PÉRIODE.
--
-- Rétrocompat STRICTE : les 3 colonnes sont nullable ou ont un défaut →
-- les dossiers existants ont date_debut/date_fin = null et tarif_libre = false,
-- soit un comportement identique à aujourd'hui. Les champs restent INERTES tant
-- que le code des lots suivants ne les lit pas.
-- À exécuter dans Supabase → SQL Editor AVANT de déployer le code des lots
-- suivants (ordre migration → code), puis recharger le cache PostgREST :
--   notify pgrst, 'reload schema';

alter table public.adherents
  add column if not exists date_debut  date,
  add column if not exists date_fin    date,
  add column if not exists tarif_libre boolean not null default false;

comment on column public.adherents.date_debut is
  'Début de la période (dossier à durée libre). NULL = dossier annuel standard.';
comment on column public.adherents.date_fin is
  'Fin de la période (dossier à durée libre). NULL = dossier annuel standard.';
comment on column public.adherents.tarif_libre is
  'true = dossier à tarif/durée libres créé par l''admin (montant fixé à la main, paiement borné à 1x/2x, affichage période). false = dossier standard (grille).';
