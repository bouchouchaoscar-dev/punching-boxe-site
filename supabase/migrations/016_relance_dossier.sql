-- 016 — Relances des DOSSIERS sans mode de paiement choisi (statut « à finaliser »
-- avec mode_paiement null : dossiers créés par l'admin, jamais menés au paiement).
-- Deux colonnes de claim idempotent DÉDIÉES (ne pas confondre avec
-- relance_paiement_manuelle_at, réservée au bouton admin « Relancer le paiement »,
-- ni avec relance_panier_*, réservées aux paniers carte stripe).

begin;

alter table public.adherents
  add column if not exists relance_dossier_1_at timestamptz,
  add column if not exists relance_dossier_2_at timestamptz;

commit;

-- Rechargement du cache PostgREST APRÈS le commit.
notify pgrst, 'reload schema';
