-- 011 — Module PLANNING (optionnel) : cours récurrents, profs, affectations, fermetures.
-- Socle réutilisable (activable par club via lib/config-club.ts → planning.actif).
-- Zéro donnée spécifique : le club saisit ses profs / cours / vacances lui-même.
--
-- 4 tables :
--   profs             — intervenants (nom, prénom, email, téléphone).
--   cours             — GRILLE RÉCURRENTE hebdomadaire (jour + heure début/fin).
--   affectations      — prof positionné sur UN cours pour UNE semaine (lundi).
--   periodes_fermeture— vacances / jours fermés (grise le calendrier).
--
-- Idempotent (create ... if not exists). RLS activée + GRANT (comme 001/schema.sql) :
-- tout passe par service_role côté serveur (bypass RLS). Aucune policy publique.

create extension if not exists "pgcrypto";

-- 1) PROFS — intervenants du club.
create table if not exists public.profs (
  id         uuid primary key default gen_random_uuid(),
  actif      boolean not null default true,
  nom        text,
  prenom     text,
  email      text,
  telephone  text,
  created_at timestamptz not null default now()
);

-- 2) COURS — grille récurrente (un cours = un créneau hebdo type, sans date).
create table if not exists public.cours (
  id            uuid primary key default gen_random_uuid(),
  actif         boolean not null default true,
  libelle       text,
  package       text,                                  -- boxe_classique | savate_prepa | null (transverse)
  type_adherent text,                                  -- adulte | jeune | null (tous)
  jour_semaine  integer check (jour_semaine between 1 and 7),  -- 1=lundi … 7=dimanche
  heure_debut   time,
  heure_fin     time,
  salle         text,
  ville         text,
  created_at    timestamptz not null default now()
);
create index if not exists cours_jour_idx  on public.cours (jour_semaine);
create index if not exists cours_actif_idx on public.cours (actif);

-- 3) AFFECTATIONS — un prof positionné sur un cours pour une semaine donnée.
--    semaine = date du LUNDI de la semaine (clé de récurrence). Ré-affecter = update.
create table if not exists public.affectations (
  id         uuid primary key default gen_random_uuid(),
  cours_id   uuid references public.cours(id) on delete cascade,
  prof_id    uuid references public.profs(id) on delete set null,
  semaine    date not null,                            -- lundi de la semaine concernée
  statut     text not null default 'prevu' check (statut in ('prevu','annule')),
  created_at timestamptz not null default now(),
  unique (cours_id, semaine)                           -- 1 affectation par occurrence de cours
);
create index if not exists affectations_semaine_idx on public.affectations (semaine);
create index if not exists affectations_prof_idx    on public.affectations (prof_id);

-- 4) PERIODES_FERMETURE — vacances / jours fermés (récurrence "sauf vacances").
create table if not exists public.periodes_fermeture (
  id         uuid primary key default gen_random_uuid(),
  libelle    text,
  date_debut date not null,
  date_fin   date not null,
  created_at timestamptz not null default now()
);
create index if not exists periodes_fermeture_dates_idx on public.periodes_fermeture (date_debut, date_fin);

-- RLS — activée, aucune policy publique (accès serveur via service_role uniquement).
alter table public.profs              enable row level security;
alter table public.cours              enable row level security;
alter table public.affectations       enable row level security;
alter table public.periodes_fermeture enable row level security;

-- GRANT — mêmes privilèges standard Supabase que les tables existantes (section
-- 8bis de schema.sql). Sans eux : « permission denied for table … » (42501).
grant all on public.profs              to anon, authenticated, service_role;
grant all on public.cours              to anon, authenticated, service_role;
grant all on public.affectations       to anon, authenticated, service_role;
grant all on public.periodes_fermeture to anon, authenticated, service_role;

notify pgrst, 'reload schema';
