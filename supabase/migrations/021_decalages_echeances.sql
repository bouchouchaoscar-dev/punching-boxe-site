-- 021 — Décalage d'échéances (report de prélèvements fractionnés à la demande de
-- l'adhérent). JOURNAL admin : trace horodatée de chaque action (ancien et nouveau
-- calendrier + motif interne). Lecture RÉSERVÉE à l'admin (service role) : RLS
-- activée SANS policy → aucun accès via la clé anon (jamais exposé au coach/public).
-- La clé primaire = actionId envoyé par le client → idempotence (un double-clic
-- ne décale pas deux fois : le 2e insert échoue en conflit de PK).

begin;

create table if not exists public.decalages_echeances (
  id            uuid primary key,                       -- actionId client = claim idempotent
  adherent_id   uuid not null references public.adherents(id) on delete cascade,
  created_at    timestamptz not null default now(),
  created_by    text,                                   -- 'admin'
  motif         text not null check (char_length(motif) <= 80),
  avant         jsonb not null,                         -- [{numero, montant, date}] avant
  apres         jsonb not null default '[]'::jsonb       -- [{numero, montant, date}] réellement appliqué
);

create index if not exists decalages_echeances_adherent_idx
  on public.decalages_echeances (adherent_id, created_at desc);

alter table public.decalages_echeances enable row level security;
-- Aucune policy : seul le service role (serveur) lit/écrit. Fail-closed côté anon.

commit;

notify pgrst, 'reload schema';
