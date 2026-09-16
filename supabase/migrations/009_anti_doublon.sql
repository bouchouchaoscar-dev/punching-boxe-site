-- 009 — Garde-fou ANTI-DOUBLON à la création d'un dossier (filet ultime, anti-course).
-- Empêche deux dossiers identiques (même compte titulaire + même saison + même
-- identité normalisée) pour les dossiers ACTIFS (non annulés). Ferme la fenêtre
-- de course que la détection applicative (protection 1) ne peut garantir à elle
-- seule sur deux inserts quasi-simultanés (rejeu réseau ~3 s).
--
-- Index UNIQUE PARTIEL : ne s'applique qu'aux dossiers non annulés à match_key
-- non null (match_key = sansAccents(nom)|prenom|date_naissance). Un dossier
-- annulé (annule_at) ou sans date (match_key null) n'est pas contraint → ne
-- casse ni les clôtures ni les rares dossiers sans date de naissance.
--
-- PRÉREQUIS vérifié avant application : aucun doublon résiduel (titulaire+saison+
-- match_key) sur les dossiers non annulés (sinon la création de l'index échoue).

create unique index if not exists adherents_unique_dossier_idx
  on public.adherents (titulaire_id, saison, match_key)
  where annule_at is null and match_key is not null;

notify pgrst, 'reload schema';
