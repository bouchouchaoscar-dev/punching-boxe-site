-- 008 — Outillage de relance des dossiers « carte en attente de paiement ».
-- Colonnes ADDITIVES et idempotentes. N'altère AUCUN flag existant :
-- relance_panier_envoyee_at (1ère relance J+1, migration 001) reste intact.
--
--   relance_paiement_manuelle_at : trace du bouton admin « Relancer le paiement »
--                                  (affichage « dernière relance », renvoi autorisé).
--   relance_panier_2_envoyee_at  : trace de la 2e relance AUTOMATIQUE (J+3),
--                                  envoi unique (jamais de 3e relance auto).

alter table public.adherents
  add column if not exists relance_paiement_manuelle_at timestamptz;

alter table public.adherents
  add column if not exists relance_panier_2_envoyee_at timestamptz;

notify pgrst, 'reload schema';
