-- 015 — Module PRÉSENCE : pointage par QR + séances d'essai avec relances.
--
-- Deux tables :
--   * essais      : séances d'essai (coordonnées + relances J+1/J+7 + conversion).
--   * presences   : pointages (un dossier OU un essai, jamais les deux).
--
-- RLS activée, AUCUN accès anonyme : tout passe par les routes serveur
-- (service_role bypasse RLS). Aucun grant à anon/authenticated.
--
-- Version APPLIQUÉE : tout le DDL dans une transaction (begin; ... commit;),
-- `notify pgrst` APRÈS le commit ; check "exactement un des deux" via cast ::int.

begin;

-- 1) Séances d'essai -------------------------------------------------------
create table if not exists public.essais (
  id                   uuid primary key default gen_random_uuid(),
  nom                  text,
  prenom               text,
  date_naissance       date,
  email                text,                         -- normalisé (minuscules)
  cours_id             uuid references public.cours(id) on delete set null,
  date_seance          date not null,
  created_at           timestamptz not null default now(),
  relance_1_at         timestamptz,                  -- claim idempotent relance 1
  relance_2_at         timestamptz,                  -- claim idempotent relance 2
  converti_dossier_id  uuid references public.adherents(id) on delete set null,
  desinscrit           boolean not null default false
);
create index if not exists essais_email_idx on public.essais (email);
create index if not exists essais_created_idx on public.essais (created_at);

alter table public.essais enable row level security;
grant all on public.essais to service_role;

-- 2) Présences -------------------------------------------------------------
create table if not exists public.presences (
  id           uuid primary key default gen_random_uuid(),
  cours_id     uuid not null references public.cours(id) on delete restrict,
  date_seance  date not null,
  dossier_id   uuid references public.adherents(id) on delete cascade,
  essai_id     uuid references public.essais(id) on delete cascade,
  source       text not null check (source in ('qr', 'manuel')),
  created_at   timestamptz not null default now(),
  created_by   text,                                  -- pour source 'manuel'
  -- Exactement UN des deux (dossier_id, essai_id) non nul.
  constraint presences_un_seul_ref
    check (((dossier_id is not null)::int + (essai_id is not null)::int) = 1)
);

-- Unicité partielle : un dossier / un essai ne pointe qu'une fois par séance.
create unique index if not exists presences_dossier_uidx
  on public.presences (cours_id, date_seance, dossier_id)
  where dossier_id is not null;
create unique index if not exists presences_essai_uidx
  on public.presences (cours_id, date_seance, essai_id)
  where essai_id is not null;
create index if not exists presences_seance_idx on public.presences (date_seance, cours_id);

alter table public.presences enable row level security;
grant all on public.presences to service_role;

commit;

-- Rechargement du cache PostgREST APRÈS le commit.
notify pgrst, 'reload schema';
