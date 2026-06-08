-- ============================================================
-- Punching Boxe — Schéma Supabase
-- À exécuter dans : Supabase → SQL Editor
-- RLS ACTIVÉ sans policy : accès réservé au serveur via service role key
-- (la clé anon publique ne peut donc rien lire). Outil interne.
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
  package                   text check (package in ('boxe_classique','savate_prepa')),
  nouveau_membre            boolean not null default false,
  option_prepa_physique     boolean not null default false,
  nb_membres_famille        integer not null default 0,
  montant_total             numeric not null default 0,
  mode_paiement             text check (mode_paiement in
                              ('stripe_1x','stripe_2x','stripe_3x','stripe_4x','especes')),
  statut_paiement           text not null default 'en_attente'
                              check (statut_paiement in
                              ('en_attente','paye','confirme_especes','echec_paiement')),
  stripe_payment_intent_id  text,
  saison                    text,
  photo_url                 text,
  fiche_inscription_url     text,
  certificat_medical_url    text,
  reglement_url             text,
  documents_valides         boolean not null default false,
  motif_refus_doc           text,
  fiche_valide              boolean default false,
  certificat_valide         boolean default false,
  reglement_valide          boolean default false,
  photo_valide              boolean default false,
  fiche_motif_refus         text,
  certificat_motif_refus    text,
  reglement_motif_refus     text,
  photo_motif_refus         text,
  stripe_customer_id        text,
  stripe_setup_intent_id    text,
  nb_echeances              integer default 1,
  echeances_payees          integer default 0,
  prochaine_echeance        date,
  derniere_erreur_stripe    text,
  derniere_erreur_code      text,
  vu_par_admin              boolean not null default false,
  -- Refonte "1 compte = N adhérents" : rattachement à un compte titulaire.
  titulaire_id              uuid references auth.users(id) on delete set null,
  lien_parente              text check (lien_parente in ('moi','enfant','frere_soeur','conjoint','autre')),
  -- Moment d'engagement (1er paiement passé) : posé une seule fois, ne change plus.
  engage_at                 timestamptz
);

-- Échéances de paiement (paiement fractionné Stripe).
create table if not exists public.paiements (
  id                        uuid primary key default gen_random_uuid(),
  adherent_id               uuid references public.adherents(id),
  stripe_payment_intent_id  text,
  montant                   numeric,
  statut                    text default 'en_attente',
  numero_echeance           integer,
  date_prevue               date,
  date_paiement             timestamptz,
  created_at                timestamptz default now()
);

-- Profils liés à Supabase Auth (espace adhérent + rôle admin futur).
create table if not exists public.profiles (
  id          uuid references auth.users(id) primary key,
  adherent_id uuid references public.adherents(id),
  role        text default 'adherent',
  created_at  timestamptz default now()
);

-- Migration pour une base déjà créée (ajoute la colonne package si absente) :
alter table public.adherents
  add column if not exists package text check (package in ('boxe_classique','savate_prepa'));

-- Migration : validation des documents par l'admin.
alter table public.adherents
  add column if not exists documents_valides boolean default false;

-- Migration : motif de refus d'un document (saisi par l'admin, vu par l'adhérent).
alter table public.adherents
  add column if not exists motif_refus_doc text;

-- Migration : validation / refus PAR DOCUMENT.
alter table public.adherents
  add column if not exists fiche_valide boolean default false,
  add column if not exists certificat_valide boolean default false,
  add column if not exists reglement_valide boolean default false,
  add column if not exists photo_valide boolean default false,
  add column if not exists fiche_motif_refus text,
  add column if not exists certificat_motif_refus text,
  add column if not exists reglement_motif_refus text,
  add column if not exists photo_motif_refus text;

-- Migration : Stripe + paiement fractionné.
alter table public.adherents
  add column if not exists stripe_customer_id text,
  add column if not exists stripe_setup_intent_id text,
  add column if not exists nb_echeances integer default 1,
  add column if not exists echeances_payees integer default 0,
  add column if not exists prochaine_echeance date,
  add column if not exists derniere_erreur_stripe text,
  add column if not exists derniere_erreur_code text;

-- Migration : badge "Nouveau" (l'admin a-t-il déjà consulté la fiche ?).
alter table public.adherents
  add column if not exists vu_par_admin boolean not null default false;

-- Migration : refonte "1 compte = N adhérents".
-- Rattachement d'un dossier adhérent à un compte titulaire (auth.users) + lien de parenté.
alter table public.adherents
  add column if not exists titulaire_id uuid,
  add column if not exists lien_parente text;

-- FK vers auth.users — ON DELETE SET NULL (préserve l'historique des dossiers
-- si le compte titulaire est supprimé ; le dossier devient simplement non rattaché).
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'adherents_titulaire_id_fkey') then
    alter table public.adherents
      add constraint adherents_titulaire_id_fkey
      foreign key (titulaire_id) references auth.users(id) on delete set null;
  end if;
end $$;

-- CHECK : valeurs autorisées pour le lien de parenté (NULL autorisé).
-- Drop robuste de l'ancien CHECK (nom auto-généré quel qu'il soit) puis
-- recréation à 5 valeurs (ajout de 'frere_soeur').
do $$
declare c text;
begin
  for c in
    select conname from pg_constraint
    where conrelid = 'public.adherents'::regclass
      and contype = 'c'
      and pg_get_constraintdef(oid) ilike '%lien_parente%'
  loop
    execute format('alter table public.adherents drop constraint %I', c);
  end loop;
end $$;

alter table public.adherents
  add constraint adherents_lien_parente_check
  check (lien_parente in ('moi','enfant','frere_soeur','conjoint','autre'));

-- Migration : élargir le CHECK de statut_paiement pour inclure 'echec_paiement'
-- (écrit par lib/payments.ts lors d'un échec de prélèvement). Drop robuste de
-- l'ancien CHECK (nom auto-généré) puis recréation nommée.
do $$
declare c text;
begin
  for c in
    select conname from pg_constraint
    where conrelid = 'public.adherents'::regclass
      and contype = 'c'
      and pg_get_constraintdef(oid) ilike '%statut_paiement%'
  loop
    execute format('alter table public.adherents drop constraint %I', c);
  end loop;
end $$;

alter table public.adherents
  add constraint adherents_statut_paiement_check
  check (statut_paiement in ('en_attente','paye','confirme_especes','echec_paiement'));

-- Migration : moment d'engagement du dossier (1er paiement passé).
alter table public.adherents
  add column if not exists engage_at timestamptz;

create table if not exists public.paiements (
  id                        uuid primary key default gen_random_uuid(),
  adherent_id               uuid references public.adherents(id),
  stripe_payment_intent_id  text,
  montant                   numeric,
  statut                    text default 'en_attente',
  numero_echeance           integer,
  date_prevue               date,
  date_paiement             timestamptz,
  created_at                timestamptz default now()
);

-- Migration : profils liés à Supabase Auth.
create table if not exists public.profiles (
  id          uuid references auth.users(id) primary key,
  adherent_id uuid references public.adherents(id),
  role        text default 'adherent',
  created_at  timestamptz default now()
);

-- Migration : saison (la colonne existe déjà ; filet idempotent + valeur par
-- défaut pour les dossiers sans saison).
alter table public.adherents add column if not exists saison text;
update public.adherents set saison = '2026-2027'
  where saison is null or saison = '';

-- Migration : renommage de la formule « Savate & Forme » → « Savate & Prépa ».
update public.adherents set package = 'savate_prepa' where package = 'savate_forme';
alter table public.adherents drop constraint if exists adherents_package_check;
alter table public.adherents
  add constraint adherents_package_check
  check (package in ('boxe_classique', 'savate_prepa'));

create index if not exists adherents_saison_idx       on public.adherents (saison);
create index if not exists adherents_statut_idx       on public.adherents (statut_paiement);
create index if not exists adherents_created_at_idx   on public.adherents (created_at desc);
create index if not exists adherents_titulaire_idx    on public.adherents (titulaire_id);

-- ---------- Module Campagnes mailing ----------
create table if not exists public.campagnes (
  id                uuid primary key default gen_random_uuid(),
  titre             text not null,
  objet             text not null,
  contenu           text not null,
  liste_type        text not null,
  liste_filtre      jsonb,
  nb_destinataires  integer,
  statut            text default 'brouillon',
  envoye_at         timestamptz,
  destinataires_liste jsonb,
  created_at        timestamptz default now()
);

-- Migration : liste réelle des destinataires d'une campagne ([{nom,prenom,email}]).
alter table public.campagnes
  add column if not exists destinataires_liste jsonb;

create table if not exists public.templates_mail (
  id          uuid primary key default gen_random_uuid(),
  nom         text not null,
  objet       text not null,
  contenu     text not null,
  est_defaut  boolean default false,
  created_at  timestamptz default now()
);

create table if not exists public.contacts_mailing (
  id          uuid primary key default gen_random_uuid(),
  nom         text,
  prenom      text,
  email       text not null unique,
  telephone   text,
  source      text default 'import',
  created_at  timestamptz default now()
);
-- Les 5 templates par défaut sont auto-insérés par l'application au premier
-- chargement de /admin/campagnes/templates (insertion par `nom` si absent).

-- ---------- Table admin_users (optionnelle — auth gérée en dur côté app) ----------
create table if not exists public.admin_users (
  id            uuid primary key default gen_random_uuid(),
  email         text unique not null,
  password_hash text,
  nom           text,
  created_at    timestamptz not null default now()
);

-- RLS ACTIVÉ sans policy : la table n'est accessible que côté serveur via
-- la SUPABASE_SERVICE_ROLE_KEY (qui contourne RLS). La clé anon publique
-- ne peut donc PAS lire les données personnelles des adhérents.
-- → Indispensable : renseigner SUPABASE_SERVICE_ROLE_KEY dans l'environnement.
alter table public.adherents   enable row level security;
alter table public.admin_users enable row level security;

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
