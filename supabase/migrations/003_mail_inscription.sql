-- 003 — Anti-doublon des mails d'inscription (confirmation adhérent + notif club).
--
-- La finalisation d'une inscription carte peut être déclenchée par DEUX chemins
-- quasi simultanés : /api/confirm-payment (client) ET le webhook Stripe
-- (payment_intent.succeeded). Sans verrou atomique, les deux envoient les mails
-- => doublon (club ET adhérent). Ce flag sert de claim atomique : un seul
-- passage bascule false->true et envoie ; les autres sont ignorés.
--
-- Réversible : repasser à false ré-autoriserait un envoi (non nécessaire en prod).
-- À exécuter dans Supabase → SQL Editor AVANT de déployer le code qui l'utilise.

alter table public.adherents
  add column if not exists mail_inscription_envoye boolean not null default false;

comment on column public.adherents.mail_inscription_envoye is
  'Anti-doublon : mails d''inscription (confirmation + notif club) déjà envoyés. Claim atomique exactly-once.';

-- Les inscriptions DÉJÀ finalisées ne doivent pas ré-émettre de mail si le flag
-- venait à être évalué : on les marque comme déjà envoyées (statut payé, ou
-- espèces déjà engagé). Idempotent.
update public.adherents
set mail_inscription_envoye = true
where mail_inscription_envoye = false
  and (statut_paiement = 'paye' or engage_at is not null);
