-- 017 — Drapeau d'anomalie de paiement à arbitrer par l'admin (orange « à
-- vérifier »). Posé par le filet de sécurité de la bascule espèces → carte : si
-- un dossier se retrouve avec des espèces CONFIRMÉES et un paiement carte
-- ENCAISSÉ, aucun remboursement automatique ; le dossier passe « à vérifier » et
-- l'admin reçoit une alerte. Lu par statutTrombi (SOURCE UNIQUE du statut).

begin;

alter table public.adherents
  add column if not exists paiement_a_verifier boolean not null default false;

commit;

-- Rechargement du cache PostgREST APRÈS le commit.
notify pgrst, 'reload schema';
