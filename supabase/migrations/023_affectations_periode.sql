-- 023 — Affectation de profs sur une PÉRIODE (Planning). Réutilise le modèle
-- hebdomadaire EXISTANT (table affectations, une ligne par cours+semaine+prof) :
-- aucun modèle parallèle. On ajoute seulement :
--   - affectations.lot_affectation_id : regroupe les lignes générées en une action
--     (suppression en bloc) ; null pour les affectations unitaires.
--   - une fonction SQL qui écrit tout le lot en UNE opération (évite la boucle
--     serverless / le timeout 60 s de Vercel). La GÉNÉRATION des séances (quelles
--     semaines, vacances exclues) est faite côté app ; la fonction ne fait qu'écrire
--     l'ensemble des couples (cours, semaine) × profs fourni.

begin;

alter table public.affectations add column if not exists lot_affectation_id uuid;
create index if not exists affectations_lot_idx
  on public.affectations (lot_affectation_id) where lot_affectation_id is not null;

-- Écrit un lot d'affectations en une seule opération. p_pairs = séances à affecter
-- [{"c":"<cours_uuid>","s":"YYYY-MM-DD(lundi)"}, …]. p_remplacer=true vide d'abord
-- les affectations existantes de ces séances (tous profs), sinon on ajoute sans
-- écraser (on conflict do nothing). Renvoie le nombre de lignes insérées.
create or replace function public.appliquer_affectations_lot(
  p_pairs jsonb,
  p_profs uuid[],
  p_lot uuid,
  p_remplacer boolean
) returns integer
language plpgsql
as $$
declare v_inserees integer;
begin
  if p_remplacer then
    delete from public.affectations a
    using jsonb_to_recordset(p_pairs) as x(c uuid, s date)
    where a.cours_id = x.c and a.semaine = x.s;
  end if;

  insert into public.affectations (cours_id, prof_id, semaine, statut, lot_affectation_id)
  select x.c, pr, x.s, 'prevu', p_lot
  from jsonb_to_recordset(p_pairs) as x(c uuid, s date)
  cross join unnest(p_profs) as pr
  on conflict (cours_id, semaine, prof_id) do nothing;

  get diagnostics v_inserees = row_count;
  return v_inserees;
end;
$$;

grant execute on function public.appliquer_affectations_lot(jsonb, uuid[], uuid, boolean) to service_role;
-- Sécurité : une fonction du schéma public est appelable par défaut via l'API
-- (anon / authenticated). On la RÉSERVE au service role (serveur uniquement).
revoke execute on function public.appliquer_affectations_lot(jsonb, uuid[], uuid, boolean) from public, anon, authenticated;

commit;

notify pgrst, 'reload schema';
