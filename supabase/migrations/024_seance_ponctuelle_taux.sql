-- 024 — Séances PONCTUELLES (stages, rattrapages, événements) + TAUX HORAIRE des profs.
--
-- 1) Séance ponctuelle : plutôt qu'une table parallèle, on RÉUTILISE la table
--    `cours` en lui ajoutant une colonne `date_unique`. Un cours avec date_unique
--    non nul est une séance à CETTE date précise (son `jour_semaine` reste calé
--    sur le jour de la date). Tous les calculs existants (affectations, heures,
--    présence, essais, vue coach) s'appuient déjà sur (cours_id, jour_semaine,
--    semaine=lundi) → ils prennent la ponctuelle sans logique dupliquée. Seule
--    différence de comportement (côté app) : elle n'apparaît QUE sur sa semaine
--    et reste visible/active même pendant une fermeture.
--
-- 2) Taux horaire : historisé avec date d'effet (le taux d'une séance est celui en
--    vigueur à sa date). Données STRICTEMENT admin → RLS activée et AUCUN droit
--    anon/authenticated (comme essais/presences en 015) ; seul service_role lit.
--
-- Transaction (begin; … commit;), `notify pgrst` APRÈS le commit.

begin;

-- 1) Séance ponctuelle -------------------------------------------------------
alter table public.cours add column if not exists date_unique date;
comment on column public.cours.date_unique is
  '[024] séance ponctuelle à cette date précise (null = cours récurrent hebdomadaire)';
create index if not exists cours_date_unique_idx
  on public.cours (date_unique) where date_unique is not null;

-- 2) Taux horaire des profs (historique avec date d'effet) -------------------
create table if not exists public.taux_horaire_prof (
  id              uuid primary key default gen_random_uuid(),
  prof_id         uuid not null references public.profs(id) on delete cascade,
  montant_horaire numeric(8,2) not null check (montant_horaire >= 0),
  date_effet      date not null,
  created_at      timestamptz not null default now(),
  unique (prof_id, date_effet)                 -- un seul taux par prof et date d'effet
);
create index if not exists taux_horaire_prof_idx
  on public.taux_horaire_prof (prof_id, date_effet);

-- Sécurité : table réservée au serveur. RLS activée SANS policy publique, et on
-- RÉVOQUE les droits par défaut que Supabase pose sur toute nouvelle table du
-- schéma public (alter default privileges … to anon, authenticated). Seul
-- service_role (qui bypasse la RLS) accède aux montants.
alter table public.taux_horaire_prof enable row level security;
revoke all on public.taux_horaire_prof from anon, authenticated;
grant all on public.taux_horaire_prof to service_role;

commit;

-- Rechargement du cache PostgREST APRÈS le commit.
notify pgrst, 'reload schema';

-- ---------------------------------------------------------------------------
-- VÉRIFICATION (un seul tableau) — à exécuter après la migration.
-- Attendu : date_unique=1 · idx_date=1 · table_taux=1 · col_taux=4 · rls_taux=true
--           · anon_taux=false · auth_taux=false · service_taux=true
-- ---------------------------------------------------------------------------
-- select
--   (select count(*) from information_schema.columns
--      where table_schema='public' and table_name='cours' and column_name='date_unique') as date_unique,
--   (select count(*) from pg_indexes where schemaname='public' and indexname='cours_date_unique_idx') as idx_date,
--   (select count(*) from information_schema.tables
--      where table_schema='public' and table_name='taux_horaire_prof') as table_taux,
--   (select count(*) from information_schema.columns
--      where table_schema='public' and table_name='taux_horaire_prof'
--        and column_name in ('prof_id','montant_horaire','date_effet','id')) as col_taux,
--   (select relrowsecurity from pg_class where oid='public.taux_horaire_prof'::regclass) as rls_taux,
--   has_table_privilege('anon','public.taux_horaire_prof','SELECT') as anon_taux,
--   has_table_privilege('authenticated','public.taux_horaire_prof','SELECT') as auth_taux,
--   has_table_privilege('service_role','public.taux_horaire_prof','SELECT') as service_taux;
