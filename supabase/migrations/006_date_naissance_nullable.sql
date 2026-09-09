-- 006 — date_naissance nullable (dossier créé par l'admin, complété ensuite).
--
-- Un dossier à tarif/durée libres est ouvert par l'admin AVANT que l'adhérent
-- ne renseigne sa date de naissance (il la saisit lors de la complétion, Lot 4).
-- On lève donc le NOT NULL sur date_naissance.
--
-- Rétrocompat STRICTE : les dossiers existants ont déjà une valeur → inchangés.
-- Le parcours d'inscription standard fournit toujours la date (validatePayload
-- l'exige côté serveur), donc aucun dossier standard ne sera créé sans date.
-- À exécuter AVANT de déployer le code du Lot 2, puis :
--   notify pgrst, 'reload schema';

alter table public.adherents
  alter column date_naissance drop not null;
