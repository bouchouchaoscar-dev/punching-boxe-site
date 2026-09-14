-- ============================================================================
-- 007 — Échec de prélèvement : horodatage + flags idempotents d'envoi.
--
-- Encadre les mails d'échec par des claims atomiques (claim-then-send, comme
-- mail_inscription_envoye) : mail adhérent (mail_echec_envoye), alerte admin
-- (mail_echec_admin_envoye), rappel J+48h (rappel_echec_envoye). echec_a =
-- horodatage de l'échec (base du rappel 48h).
--
-- Idempotent. À exécuter dans Supabase → SQL Editor → Run, PUIS recharger le
-- cache PostgREST. Le code est résilient : sans ces colonnes il continue
-- d'envoyer (best-effort, comportement actuel) ; avec, l'idempotence s'active.
-- ============================================================================

alter table public.paiements add column if not exists echec_a timestamptz;
alter table public.paiements add column if not exists mail_echec_envoye boolean not null default false;
alter table public.paiements add column if not exists mail_echec_admin_envoye boolean not null default false;
alter table public.paiements add column if not exists rappel_echec_envoye boolean not null default false;

notify pgrst, 'reload schema';
