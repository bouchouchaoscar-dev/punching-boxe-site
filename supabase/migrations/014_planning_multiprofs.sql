-- 014 — Planning : PLUSIEURS profs par cours/semaine + suivi des envois + archivage prof.
--
-- Protection de l'historique (heures profs → stats/défraiement) :
--   * la FK affectations.prof_id passe en ON DELETE RESTRICT (jamais de cascade
--     silencieuse : on ne peut pas supprimer un prof qui a des affectations) ;
--   * l'archivage (profs.actif = false, colonne déjà présente depuis 011) sert à
--     retirer un prof des propositions sans toucher à ses affectations passées.
--
-- ⚠️ AVANT d'appliquer, lancer la REQUÊTE DE PRÉ-VÉRIFICATION (fournie à part)
--    pour voir les affectations sans prof qui seront supprimées ci-dessous.
--
-- Version APPLIQUÉE : tout le DDL dans une transaction (begin; ... commit;),
-- `notify pgrst` APRÈS le commit ; comparaisons de colonnes en ::text / ::text[]
-- dans les boucles du bloc DO (robustesse cross-collation).

begin;

-- 1) Nettoyage des anciennes lignes « aucun prof » (ce concept disparaît).
delete from public.affectations where prof_id is null;

-- 2) Suppression ROBUSTE de toute unicité sur (cours_id, semaine) SEULE,
--    quel que soit son nom (contrainte UNIQUE et/ou index unique équivalent).
do $$
declare r record;
begin
  for r in
    select con.conname
    from pg_constraint con
    where con.conrelid = 'public.affectations'::regclass
      and con.contype = 'u'
      and (
        select array_agg(att.attname::text order by att.attname)
        from unnest(con.conkey) k
        join pg_attribute att on att.attrelid = con.conrelid and att.attnum = k
      ) = array['cours_id', 'semaine']::text[]
  loop
    execute format('alter table public.affectations drop constraint %I', r.conname);
  end loop;

  for r in
    select i.relname
    from pg_index x
    join pg_class i on i.oid = x.indexrelid
    where x.indrelid = 'public.affectations'::regclass
      and x.indisunique
      and not x.indisprimary
      and (
        select array_agg(att.attname::text order by att.attname)
        from unnest(x.indkey) k
        join pg_attribute att on att.attrelid = x.indrelid and att.attnum = k
      ) = array['cours_id', 'semaine']::text[]
  loop
    execute format('drop index if exists public.%I', r.relname);
  end loop;
end $$;

-- 3) prof_id obligatoire (une affectation = un prof précis).
alter table public.affectations alter column prof_id set not null;

-- 4) FK prof_id → RESTRICT (protège l'historique : pas de suppression en cascade).
alter table public.affectations drop constraint if exists affectations_prof_id_fkey;
alter table public.affectations
  add constraint affectations_prof_id_fkey
  foreign key (prof_id) references public.profs(id) on delete restrict;

-- 5) Nouvelle unicité multi-profs (idempotent : ne recrée pas si déjà là).
do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.affectations'::regclass and conname = 'affectations_cours_semaine_prof_key'
  ) then
    alter table public.affectations
      add constraint affectations_cours_semaine_prof_key unique (cours_id, semaine, prof_id);
  end if;
end $$;

-- 6) Archivage prof : réutilise profs.actif (présent depuis 011). Filet idempotent.
alter table public.profs add column if not exists actif boolean not null default true;

-- 7) ENVOIS_PLANNING : suivi par prof/semaine (idempotence + diff). Simples traces
--    d'envoi → CASCADE OK ; prof_id NOT NULL.
create table if not exists public.envois_planning (
  id         uuid primary key default gen_random_uuid(),
  prof_id    uuid not null references public.profs(id) on delete cascade,
  semaine    date not null,
  envoye_at  timestamptz not null default now(),
  snapshot   jsonb not null default '[]'::jsonb,
  unique (prof_id, semaine)
);
-- Si la table existait déjà (rejeu), forcer prof_id NOT NULL.
alter table public.envois_planning alter column prof_id set not null;
create index if not exists envois_planning_semaine_idx on public.envois_planning (semaine);

alter table public.envois_planning enable row level security;
grant all on public.envois_planning to anon, authenticated, service_role;

commit;

-- Rechargement du cache PostgREST APRÈS le commit.
notify pgrst, 'reload schema';
