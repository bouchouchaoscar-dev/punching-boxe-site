-- 018 — Changements de formule (ajout option prépa par l'adhérent, gestion par
-- l'admin). Historique + pilotage des relances. Le SUPPLÉMENT éventuel reste un
-- paiement normal dans la table `paiements` (factures/statutTrombi/dashboard le
-- prennent naturellement). `adherents.supplement_statut` est un drapeau DÉRIVÉ
-- (maintenu par le serveur depuis l'état réel du paiement) lu par statutTrombi
-- pour afficher « à finaliser » (carte) / « espèces en attente » quand la
-- cotisation est réglée mais le supplément non encaissé.

begin;

create table if not exists public.changements_formule (
  id                 uuid primary key default gen_random_uuid(),
  dossier_id         uuid not null references public.adherents(id) on delete cascade,
  ancienne_formule   text,
  nouvelle_formule   text,
  source             text check (source in ('adherent','admin')),
  montant_cents      integer not null default 0,     -- + = supplément dû, - = remboursement, 0
  mode_reglement     text check (mode_reglement in
                       ('carte','especes','offert','remboursement_carte','remboursement_hors_ligne')),
  statut             text not null default 'actif'
                       check (statut in ('en_attente_paiement','actif','annule')),
  payment_intent_id  text,
  paiement_id        uuid references public.paiements(id) on delete set null,
  signature_requise  boolean not null default false,
  signe_at           timestamptz,
  relance_1_at       timestamptz,
  relance_2_at       timestamptz,
  created_by         text,
  motif              text,
  created_at         timestamptz not null default now()
);
create index if not exists changements_formule_dossier_idx on public.changements_formule (dossier_id);
create index if not exists changements_formule_statut_idx   on public.changements_formule (statut);

alter table public.changements_formule enable row level security;

-- Drapeau DÉRIVÉ du supplément en attente (lu par statutTrombi). null = aucun.
alter table public.adherents
  add column if not exists supplement_statut text
    check (supplement_statut in ('a_finaliser','attente_especes'));

commit;

-- Rechargement du cache PostgREST APRÈS le commit.
notify pgrst, 'reload schema';
