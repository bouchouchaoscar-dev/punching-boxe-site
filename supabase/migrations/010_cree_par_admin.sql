-- 010 — Marqueur explicite « dossier créé par l'admin ».
-- Sert à restreindre le bouton "Renvoyer le lien d'activation" (fiche admin) aux
-- dossiers dont le COMPTE a été créé par l'admin (via /api/admin/adherents/creer),
-- pas aux auto-inscriptions (où l'adhérent a défini son mot de passe lui-même).
-- Champ propre et durable, indépendant de tarif_libre (signal indirect fragile).

alter table public.adherents
  add column if not exists cree_par_admin boolean not null default false;

-- BACKFILL (une seule fois) : aujourd'hui « créé par admin » coïncide EXACTEMENT
-- avec tarif_libre = true (seul creer/route.ts pose tarif_libre = true). On s'en
-- sert pour initialiser le champ ; ensuite cree_par_admin vit indépendamment.
update public.adherents
  set cree_par_admin = true
  where tarif_libre = true and cree_par_admin = false;

notify pgrst, 'reload schema';
