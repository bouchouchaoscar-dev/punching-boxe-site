-- ============================================================
-- Punching Boxe — Schéma Supabase
-- À exécuter dans : Supabase → SQL Editor
-- RLS désactivé (outil interne, accès via service role key côté serveur)
-- ============================================================

-- Extension UUID (généralement déjà active sur Supabase)
create extension if not exists "pgcrypto";

-- ---------- Table adherents ----------
create table if not exists public.adherents (
  id                        uuid primary key default gen_random_uuid(),
  created_at                timestamptz not null default now(),
  nom                       text not null,
  prenom                    text not null,
  date_naissance            date not null,
  email                     text not null,
  telephone                 text,
  adresse                   text,
  ville                     text,
  code_postal               text,
  type_adherent             text check (type_adherent in ('adulte','jeune')),
  nouveau_membre            boolean not null default false,
  option_prepa_physique     boolean not null default false,
  nb_membres_famille        integer not null default 0,
  montant_total             numeric not null default 0,
  mode_paiement             text check (mode_paiement in
                              ('stripe_1x','stripe_2x','stripe_3x','stripe_4x','especes')),
  statut_paiement           text not null default 'en_attente'
                              check (statut_paiement in
                              ('en_attente','paye','confirme_especes')),
  stripe_payment_intent_id  text,
  saison                    text,
  photo_url                 text,
  fiche_inscription_url     text,
  certificat_medical_url    text,
  reglement_url             text
);

create index if not exists adherents_saison_idx       on public.adherents (saison);
create index if not exists adherents_statut_idx       on public.adherents (statut_paiement);
create index if not exists adherents_created_at_idx   on public.adherents (created_at desc);

-- ---------- Table admin_users (optionnelle — auth gérée en dur côté app) ----------
create table if not exists public.admin_users (
  id            uuid primary key default gen_random_uuid(),
  email         text unique not null,
  password_hash text,
  nom           text,
  created_at    timestamptz not null default now()
);

-- RLS désactivé explicitement (outil interne)
alter table public.adherents   disable row level security;
alter table public.admin_users disable row level security;

-- ============================================================
-- STORAGE : bucket public pour les documents des adhérents
-- (À exécuter aussi, ou créer le bucket via l'UI Storage)
-- ============================================================
insert into storage.buckets (id, name, public)
values ('adherents-documents', 'adherents-documents', true)
on conflict (id) do nothing;

-- Politiques permissives pour le bucket (lecture publique, écriture service role).
-- L'écriture passe par la service role key côté serveur, qui contourne RLS.
do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'storage' and tablename = 'objects'
      and policyname = 'pbnp_public_read'
  ) then
    create policy "pbnp_public_read" on storage.objects
      for select using (bucket_id = 'adherents-documents');
  end if;
end$$;
