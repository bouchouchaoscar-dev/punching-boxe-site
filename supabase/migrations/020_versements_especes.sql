-- 020 — Encaissement ESPÈCES en PLUSIEURS FOIS (cotisation ET supplément de
-- changement de formule). Chaque versement devient une vraie ligne `paiements`
-- (numero_echeance null, sans PaymentIntent, statut 'paye'). Le total encaissé se
-- CALCULE depuis ces lignes ; le statut dérivé reste écrit par recalculerEtatPaiement.
--   - note          : note interne courte du versement (ex. « versement maman »)
--   - changement_id : rattache un versement au SUPPLÉMENT d'un changement de
--                     formule (null = versement de cotisation).
-- L'idempotence anti-double-clic réutilise paiements.id (clé envoyée par le client).

begin;

alter table public.paiements
  add column if not exists note text;

alter table public.paiements
  drop constraint if exists paiements_note_len;
alter table public.paiements
  add constraint paiements_note_len check (note is null or char_length(note) <= 80);

alter table public.paiements
  add column if not exists changement_id uuid references public.changements_formule(id) on delete set null;

create index if not exists paiements_changement_idx
  on public.paiements (changement_id) where changement_id is not null;

commit;

notify pgrst, 'reload schema';
