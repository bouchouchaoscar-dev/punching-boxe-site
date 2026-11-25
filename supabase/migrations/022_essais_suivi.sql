-- 022 — Suivi des séances d'essai (fondations) : coordonnées de rappel, provenance
-- (sur essais ET adherents), et suivi des rappels téléphoniques. Les nouvelles
-- colonnes sont NULLABLES (les essais existants n'ont pas de téléphone). On NE
-- stocke JAMAIS le statut ni la date d'inscription d'un essai : ils sont DÉRIVÉS à
-- la lecture (fonction pure statutEssai) depuis le dossier + la table paiements.
--   - telephone        : numéro normalisé E.164 (app-side), facultatif en base
--   - provenance       : code « comment avez-vous connu le club ? » (liste en config)
--   - provenance_autre : texte libre si provenance = 'autre' (<= 80)
--   - rappele_at / rappel_note / rappele_par : suivi du rappel téléphonique admin

begin;

-- ESSAIS ---------------------------------------------------------------------
alter table public.essais add column if not exists telephone        text;
alter table public.essais add column if not exists provenance       text;
alter table public.essais add column if not exists provenance_autre text;
alter table public.essais add column if not exists rappele_at       timestamptz;
alter table public.essais add column if not exists rappel_note      text;
alter table public.essais add column if not exists rappele_par      text;

alter table public.essais drop constraint if exists essais_provenance_autre_len;
alter table public.essais add  constraint essais_provenance_autre_len
  check (provenance_autre is null or char_length(provenance_autre) <= 80);
alter table public.essais drop constraint if exists essais_rappel_note_len;
alter table public.essais add  constraint essais_rappel_note_len
  check (rappel_note is null or char_length(rappel_note) <= 120);

-- ADHERENTS ------------------------------------------------------------------
alter table public.adherents add column if not exists provenance       text;
alter table public.adherents add column if not exists provenance_autre text;

alter table public.adherents drop constraint if exists adherents_provenance_autre_len;
alter table public.adherents add  constraint adherents_provenance_autre_len
  check (provenance_autre is null or char_length(provenance_autre) <= 80);

-- INDEX (conversion + tri par date de séance) --------------------------------
create index if not exists essais_converti_idx
  on public.essais (converti_dossier_id) where converti_dossier_id is not null;
create index if not exists essais_date_seance_idx
  on public.essais (date_seance);

commit;

notify pgrst, 'reload schema';
