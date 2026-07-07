-- 002 — Adresses email bouncées (rejetées), exclues des campagnes de masse.
--
-- Table dédiée, clé = email (calquée sur desinscriptions_mailing) : la présence
-- d'une ligne suffit à EXCLURE l'adresse de TOUTES les campagnes, quelle que soit
-- sa source (adherents, anciens_adherents, contacts_mailing, email manuel).
-- Ne supprime rien. Réversible : supprimer la ligne réactive l'adresse.
-- N'affecte PAS les mails transactionnels (confirmation, reset, relances indiv.).
-- Le futur webhook Resend (chantier séparé) n'aura qu'à INSÉRER ici.
--
-- À exécuter dans Supabase → SQL Editor.

create table if not exists public.emails_bounced (
  email      text primary key,             -- stocké en minuscules ; présence = exclu des CAMPAGNES
  reason     text,                         -- 'manuel' | 'hard_bounce' | 'resend_webhook' (optionnel)
  bounced_at timestamptz not null default now()
);

comment on table public.emails_bounced is
  'Adresses email rejetées (bounce). Présence = exclue des campagnes de masse. Réversible.';

-- RLS activé sans policy : accès via service_role uniquement (comme desinscriptions_mailing).
alter table public.emails_bounced enable row level security;

-- Marquage des 5 adresses connues (stockées en minuscules).
insert into public.emails_bounced (email, reason) values
  ('ka-dny@yahoo.fr',                 'manuel'),
  ('ludovic.lorey@gmail.com',         'manuel'),
  ('jans77680@hotmail.fr',            'manuel'),
  ('corinnefaya1@gmail.com',          'manuel'),
  ('christophe.gnaedinger@cnhind.com','manuel')
on conflict (email) do nothing;

-- Contrôle 1 : les 5 lignes insérées.
select email, reason, bounced_at
from public.emails_bounced
order by email;

-- Contrôle 2 : où chaque adresse existe (confirme qu'elle sera bien exclue à l'envoi).
select e.email,
       exists (select 1 from public.adherents a        where lower(a.email)  = e.email) as dans_adherents,
       exists (select 1 from public.anciens_adherents n where lower(n.email)  = e.email) as dans_anciens,
       exists (select 1 from public.contacts_mailing  c where lower(c.email)  = e.email) as dans_contacts
from public.emails_bounced e
order by e.email;
