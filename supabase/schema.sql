-- ============================================================================
-- SCHÉMA CONSOLIDÉ — Template club sportif (Agence DriveAsso)
-- ----------------------------------------------------------------------------
-- FICHIER CANON POUR UN NOUVEAU CLIENT : appliqué UNE SEULE FOIS sur une base
-- VIERGE (Supabase → SQL Editor → coller → Run), il produit EXACTEMENT le même
-- schéma que Punching Boxe après application de 001 PUIS 004→010.
--
-- ⚠️ NE PAS rejouer sur une base EXISTANTE déjà migrée (ex. Punching Boxe) :
-- la prod PB a reçu 001→010 une par une. Ce fichier est la CIBLE des FUTURS
-- clients. Les fichiers supabase/migrations/*.sql restent l'HISTORIQUE appliqué
-- sur PB (ne pas les supprimer). Idempotent (create ... if not exists).
--
-- Équivalence (voir chantier de consolidation) : 001 (socle, intègre déjà 003 +
-- 004_resignature + 004_templates_personnalise) + 005 (tarif/durée libres) +
-- 006 (date_naissance nullable) + 007 (échec: flags idempotents) + 008 (relance
-- paiement) + 009 (index unique anti-doublon) + 010 (cree_par_admin).
-- Les backfills UPDATE des migrations sont OMIS (no-op sur base vierge) ; les
-- SEED de données spécifiques PB (emails bouncés du 002) NE sont PAS repris.
--
-- SÉCURITÉ STORAGE : le bucket documents est créé PRIVÉ (public=false), aligné
-- sur l'état LIVE de Punching Boxe (bucket privé + URLs signées côté code).
-- C'est la SEULE différence volontaire avec le texte brut de 001 (qui créait le
-- bucket public=true, avant le durcissement sécurité). Voir section 9.
--
-- RLS activée partout sans policy publique : tout passe par le serveur via
-- SUPABASE_SERVICE_ROLE_KEY (contourne la RLS). GRANTS inclus (section 8bis) →
-- aucun correctif de permissions à exécuter après coup.
-- ============================================================================

create extension if not exists "pgcrypto";

-- ---------------------------------------------------------------------------
-- 1) ADHERENTS — dossier d'inscription (cœur du produit)
-- ---------------------------------------------------------------------------
create table if not exists public.adherents (
  id                        uuid primary key default gen_random_uuid(),
  created_at                timestamptz not null default now(),
  -- Identité
  nom                       text not null,
  prenom                    text not null,
  date_naissance            date,                             -- [006] nullable (dossier admin complété ensuite)
  email                     text not null,
  telephone                 text,
  adresse                   text,
  ville                     text,
  code_postal               text,
  -- Formule & tarif
  type_adherent             text check (type_adherent in ('adulte','jeune')),
  package                   text check (package in ('boxe_classique','savate_prepa')),
  nouveau_membre            boolean not null default false,   -- adhésion 1ère année due
  option_prepa_physique     boolean not null default false,
  nb_membres_famille        integer not null default 0,       -- rang du foyer (remise)
  montant_total             numeric not null default 0,
  saison                    text,
  -- Tarif/durée libres (dossier sur-mesure créé par l'admin) [005]
  date_debut                date,                             -- NULL = dossier annuel standard
  date_fin                  date,                             -- NULL = dossier annuel standard
  tarif_libre               boolean not null default false,   -- true = montant fixé main + période
  -- Paiement
  mode_paiement             text check (mode_paiement in
                              ('stripe_1x','stripe_2x','stripe_3x','stripe_4x','especes')),
  statut_paiement           text not null default 'en_attente'
                              check (statut_paiement in
                              ('en_attente','paye','confirme_especes','echec_paiement')),
  stripe_customer_id        text,
  stripe_payment_intent_id  text,
  stripe_setup_intent_id    text,
  nb_echeances              integer default 1,
  echeances_payees          integer default 0,
  prochaine_echeance        date,
  derniere_erreur_stripe    text,
  derniere_erreur_code      text,
  engage_at                 timestamptz,                      -- 1er paiement passé (figé)
  -- Documents (URLs storage) + validation par pièce
  photo_url                 text,
  fiche_inscription_url     text,
  certificat_medical_url    text,
  reglement_url             text,
  documents_valides         boolean not null default false,   -- dérivé (4/4)
  motif_refus_doc           text,
  fiche_valide              boolean default false,
  certificat_valide         boolean default false,
  reglement_valide          boolean default false,
  photo_valide              boolean default false,
  fiche_motif_refus         text,
  certificat_motif_refus    text,
  reglement_motif_refus     text,
  photo_motif_refus         text,
  -- Signature en ligne (fiche + règlement générés) : trace
  fiche_signee_at           timestamptz,
  reglement_signee_at       timestamptz,
  signature_ip              text,
  -- Compte titulaire (1 compte = N adhérents) + lien de parenté
  titulaire_id              uuid references auth.users(id) on delete set null,
  lien_parente              text check (lien_parente in ('moi','enfant','frere_soeur','conjoint','autre')),
  -- Foyer familial (rattachement cross-comptes → remise)
  foyer_id                  uuid,
  attestation_foyer_at      timestamptz,
  -- Ancienneté / migration (matching avec anciens importés)
  ancien_id                 uuid,
  match_key                 text,
  match_a_verifier          boolean default false,
  -- Remboursement / clôture / litige
  montant_rembourse         numeric default 0,
  rembourse_at              timestamptz,
  annule_at                 timestamptz,                      -- fin d'inscription
  litige                    boolean default false,
  litige_statut             text,
  -- Admin
  vu_par_admin              boolean not null default false,   -- badge "Nouveau"
  mail_dossier_complet_envoye boolean not null default false, -- anti-doublon mail
  relance_panier_envoyee_at timestamptz,                      -- relance panier abandonné (1ère, unique)
  relance_panier_2_envoyee_at timestamptz,                    -- [008] 2e relance panier (J+3, unique)
  relance_paiement_manuelle_at timestamptz,                   -- [008] renvoi manuel admin du lien de paiement
  mail_inscription_envoye   boolean not null default false,   -- [003] anti-doublon mails d'inscription (claim atomique)
  cree_par_admin            boolean not null default false,   -- [010] dossier dont le compte a été créé par l'admin
  -- Re-signature de documents (fiche / règlement) demandée par l'admin [004_resignature]
  fiche_a_resigner          boolean not null default false,   -- doc à re-signer par l'adhérent
  reglement_a_resigner      boolean not null default false,   -- doc à re-signer par l'adhérent
  resignature_demandee_at   timestamptz,                      -- quand l'admin a demandé la re-signature
  responsable               text                              -- représentant légal (persisté à la re-signature)
);

create index if not exists adherents_saison_idx      on public.adherents (saison);
create index if not exists adherents_statut_idx       on public.adherents (statut_paiement);
create index if not exists adherents_created_at_idx   on public.adherents (created_at desc);
create index if not exists adherents_titulaire_idx    on public.adherents (titulaire_id);
create index if not exists adherents_foyer_idx        on public.adherents (foyer_id);
create index if not exists adherents_match_key_idx    on public.adherents (match_key);
create index if not exists adherents_ancien_id_idx    on public.adherents (ancien_id);

-- [009] Garde-fou ANTI-DOUBLON (filet ultime anti-course) : unicité d'un dossier
-- ACTIF (non annulé) par compte titulaire + saison + identité normalisée.
create unique index if not exists adherents_unique_dossier_idx
  on public.adherents (titulaire_id, saison, match_key)
  where annule_at is null and match_key is not null;

-- ---------------------------------------------------------------------------
-- 2) PAIEMENTS — échéances (fractionné Stripe) + encaissement espèces
-- ---------------------------------------------------------------------------
create table if not exists public.paiements (
  id                        uuid primary key default gen_random_uuid(),
  adherent_id               uuid references public.adherents(id) on delete cascade,
  stripe_payment_intent_id  text,
  montant                   numeric,
  montant_rembourse         numeric default 0,
  statut                    text default 'en_attente',  -- en_attente|en_cours|paye|echec|annule|rembourse|planifiee
  numero_echeance           integer,                    -- null = encaissement espèces global
  date_prevue               date,
  date_paiement             timestamptz,
  created_at                timestamptz default now(),
  -- [007] Échec de prélèvement : horodatage + flags idempotents (claim-then-send)
  echec_a                   timestamptz,
  mail_echec_envoye         boolean not null default false,
  mail_echec_admin_envoye   boolean not null default false,
  rappel_echec_envoye       boolean not null default false
);
create index if not exists paiements_adherent_idx on public.paiements (adherent_id);
create index if not exists paiements_statut_idx   on public.paiements (statut);
create index if not exists paiements_due_idx      on public.paiements (date_prevue);

-- ---------------------------------------------------------------------------
-- 3) REMBOURSEMENTS — journal des remboursements / clôtures (idempotent par id)
-- ---------------------------------------------------------------------------
create table if not exists public.remboursements (
  id                uuid primary key,                 -- actionId (clé d'idempotence)
  adherent_id       uuid references public.adherents(id) on delete cascade,
  montant_demande   numeric,
  montant_effectif  numeric,
  canal             text,                             -- stripe | especes | virement
  ferme_inscription boolean default false,
  statut            text default 'en_cours',          -- en_cours | fait | erreur
  detail            jsonb,
  created_at        timestamptz default now(),
  finished_at       timestamptz
);
create index if not exists remboursements_adherent_idx on public.remboursements (adherent_id);

-- ---------------------------------------------------------------------------
-- 4) PROFILES — lien Supabase Auth ↔ adhérent (espace adhérent)
-- ---------------------------------------------------------------------------
create table if not exists public.profiles (
  id          uuid references auth.users(id) on delete cascade primary key,
  adherent_id uuid references public.adherents(id),
  role        text default 'adherent',
  created_at  timestamptz default now()
);

-- ---------------------------------------------------------------------------
-- 5) ANCIENS_ADHERENTS + HISTORIQUE_SAISONS — base importée (réinscription)
-- ---------------------------------------------------------------------------
create table if not exists public.anciens_adherents (
  id             uuid primary key default gen_random_uuid(),
  nom            text,
  prenom         text,
  date_naissance date,
  email          text,
  telephone      text,
  adresse        text,
  ville          text,
  code_postal    text,
  match_key      text,                                -- sansAccents(nom)|prenom|naissance
  a_verifier     boolean default false,
  source         text,
  notes          text,
  created_at     timestamptz default now()
);
create index if not exists anciens_match_key_idx on public.anciens_adherents (match_key);

create table if not exists public.historique_saisons (
  id             uuid primary key default gen_random_uuid(),
  ancien_id      uuid references public.anciens_adherents(id) on delete cascade,
  saison         text,
  disciplines    text[],
  type_adherent  text,
  montant        numeric,
  mode_reglement text,
  date_validation date,
  created_at     timestamptz default now()
);
create index if not exists historique_ancien_idx on public.historique_saisons (ancien_id);

-- ---------------------------------------------------------------------------
-- 6) CAMPAGNES MAILING + TEMPLATES + CONTACTS + DÉSINSCRIPTIONS + BOUNCES
-- ---------------------------------------------------------------------------
create table if not exists public.campagnes (
  id                  uuid primary key default gen_random_uuid(),
  titre               text not null,
  objet               text not null,
  contenu             text not null,
  liste_type          text not null,
  liste_filtre        jsonb,
  destinataires_liste jsonb,
  nb_destinataires    integer,
  nb_envoyes          integer,
  nb_exclus           integer,
  type                text default 'campagne',         -- campagne | individuel
  cible               text,
  statut              text default 'brouillon',        -- brouillon|planifiee|en_cours|envoye|erreur
  etat                text default 'active',           -- active | pause
  scheduled_at        timestamptz,                     -- envoi différé
  envoye_at           timestamptz,
  created_at          timestamptz default now()
);
create index if not exists campagnes_statut_idx on public.campagnes (statut);

create table if not exists public.templates_mail (
  id          uuid primary key default gen_random_uuid(),
  nom         text not null,
  objet       text not null,
  contenu     text not null,
  categorie   text check (categorie in ('informatif','relance_admin','reinscription','reactivation')),
  est_defaut  boolean default false,
  -- [004_templates] true dès que l'admin édite un modèle par défaut → la synchro
  -- des défauts depuis le code (route templates) ne l'écrasera JAMAIS. Un nouveau
  -- club part à false et bénéficie des mises à jour des modèles neutres du socle.
  personnalise boolean not null default false,
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

create table if not exists public.desinscriptions_mailing (
  email       text primary key,                        -- présence = désinscrit des CAMPAGNES
  source      text,
  created_at  timestamptz not null default now()
);

-- [002] Adresses email bouncées (rejetées), exclues des campagnes de masse.
-- (Le SEED des adresses spécifiques PB n'est PAS repris ici : nouveau client = vide.)
create table if not exists public.emails_bounced (
  email      text primary key,             -- stocké en minuscules ; présence = exclu des CAMPAGNES
  reason     text,                         -- 'manuel' | 'hard_bounce' | 'resend_webhook'
  bounced_at timestamptz not null default now()
);

-- Suivi PAR DESTINATAIRE d'une campagne (1 ligne = 1 email envoyé/échoué).
create table if not exists public.envois_mailing (
  id          uuid primary key default gen_random_uuid(),
  campagne_id uuid references public.campagnes(id) on delete cascade,
  email       text not null,
  prenom      text,
  nom         text,
  statut      text not null default 'envoye',          -- envoye | echec
  erreur      text,
  created_at  timestamptz not null default now()
);
create index if not exists envois_mailing_campagne_idx on public.envois_mailing (campagne_id);

-- Anti-doublon de la relance « compte sans inscription » (présence = relancé).
create table if not exists public.relances_compte (
  user_id  uuid primary key references auth.users(id) on delete cascade,
  email    text,
  sent_at  timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- 7) ADMIN_USERS — optionnel (auth admin gérée en dur côté app par défaut)
-- ---------------------------------------------------------------------------
create table if not exists public.admin_users (
  id            uuid primary key default gen_random_uuid(),
  email         text unique not null,
  password_hash text,
  nom           text,
  created_at    timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- 7bis) PLANNING [011] — module OPTIONNEL (activable via lib/config-club.ts).
--   Socle réutilisable, zéro donnée en dur : le club saisit profs/cours/vacances.
--   profs (intervenants) · cours (grille récurrente hebdo) · affectations (prof
--   sur un cours pour une semaine) · periodes_fermeture (vacances / jours fermés).
-- ---------------------------------------------------------------------------
create table if not exists public.profs (
  id         uuid primary key default gen_random_uuid(),
  actif      boolean not null default true,
  nom        text,
  prenom     text,
  email      text,
  telephone  text,
  created_at timestamptz not null default now()
);

create table if not exists public.cours (
  id            uuid primary key default gen_random_uuid(),
  actif         boolean not null default true,
  libelle       text,
  discipline    text check (discipline in ('boxe_francaise','savate','prepa_physique')), -- [013] discipline enseignée (champ de référence du planning)
  package       text,                                  -- [héritage] formule d'adhésion — conservé, non utilisé par le planning
  avec_prepa    boolean not null default false,        -- [héritage 012] — conservé, non utilisé par le planning
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

create table if not exists public.affectations (
  id         uuid primary key default gen_random_uuid(),
  cours_id   uuid references public.cours(id) on delete cascade,
  prof_id    uuid references public.profs(id) on delete set null,
  semaine    date not null,                            -- lundi de la semaine concernée
  statut     text not null default 'prevu' check (statut in ('prevu','annule')),
  created_at timestamptz not null default now(),
  unique (cours_id, semaine)
);
create index if not exists affectations_semaine_idx on public.affectations (semaine);
create index if not exists affectations_prof_idx    on public.affectations (prof_id);

create table if not exists public.periodes_fermeture (
  id         uuid primary key default gen_random_uuid(),
  libelle    text,
  date_debut date not null,
  date_fin   date not null,
  created_at timestamptz not null default now()
);
create index if not exists periodes_fermeture_dates_idx on public.periodes_fermeture (date_debut, date_fin);

-- ---------------------------------------------------------------------------
-- 8) RLS — activé partout, AUCUNE policy publique (accès serveur uniquement)
-- ---------------------------------------------------------------------------
alter table public.adherents               enable row level security;
alter table public.paiements               enable row level security;
alter table public.remboursements          enable row level security;
alter table public.profiles                enable row level security;
alter table public.anciens_adherents       enable row level security;
alter table public.historique_saisons      enable row level security;
alter table public.campagnes               enable row level security;
alter table public.templates_mail          enable row level security;
alter table public.contacts_mailing        enable row level security;
alter table public.desinscriptions_mailing enable row level security;
alter table public.emails_bounced          enable row level security;   -- [002]
alter table public.envois_mailing          enable row level security;
alter table public.relances_compte         enable row level security;
alter table public.admin_users             enable row level security;
alter table public.profs                   enable row level security;   -- [011] planning
alter table public.cours                   enable row level security;   -- [011] planning
alter table public.affectations            enable row level security;   -- [011] planning
alter table public.periodes_fermeture      enable row level security;   -- [011] planning

-- ---------------------------------------------------------------------------
-- 8bis) GRANTS — privilèges standard Supabase sur le schéma public.
--   INDISPENSABLE : le serveur passe TOUJOURS par service_role. La RLS reste
--   active et sans policy publique (section 8) → anon/authenticated restent
--   bloqués sur les DONNÉES ; seul service_role (qui bypass la RLS) y accède.
--   Sans ces GRANT, les tables existent mais l'API renvoie « permission denied
--   for table … » (42501). On rétablit les droits que Supabase pose par défaut
--   → aucun correctif post-déploiement nécessaire.
-- ---------------------------------------------------------------------------
grant usage on schema public to anon, authenticated, service_role;

grant all on all tables    in schema public to anon, authenticated, service_role;
grant all on all sequences in schema public to anon, authenticated, service_role;
grant all on all functions in schema public to anon, authenticated, service_role;

-- Objets créés à l'avenir dans public (tables/séquences/fonctions ultérieures).
alter default privileges in schema public grant all on tables    to anon, authenticated, service_role;
alter default privileges in schema public grant all on sequences to anon, authenticated, service_role;
alter default privileges in schema public grant all on functions to anon, authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 9) STORAGE — bucket des documents adhérents.
--   ⚠️ CRÉÉ PRIVÉ (public=false) — aligné sur l'état LIVE de Punching Boxe après
--   durcissement sécurité (bucket privé + URLs SIGNÉES côté code, cf.
--   lib/storage-url.ts). SEULE différence volontaire avec le 001 d'origine (qui
--   créait le bucket public=true + une policy de lecture publique). NE PAS
--   recréer de policy de lecture publique : l'accès aux fichiers se fait
--   exclusivement via service_role (URLs signées).
-- ---------------------------------------------------------------------------
insert into storage.buckets (id, name, public)
values ('adherents-documents', 'adherents-documents', false)
on conflict (id) do nothing;

-- ============================================================================
-- FIN. Modèles d'emails : seedés automatiquement au 1er chargement de l'espace
-- admin (route /api/admin/templates). Étape suivante : import éventuel des
-- anciens (scripts/import-anciens.mts).
-- ============================================================================
