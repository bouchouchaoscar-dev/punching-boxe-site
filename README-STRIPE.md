# Configuration Stripe — Punching Boxe

Intégration des paiements en ligne avec tarification proratisée et paiement
fractionné (1x / 2x / 3x / 4x) étalé jusqu'à la fin de la saison (30 juin).

## 1. Variables d'environnement (Vercel → Settings → Environment Variables)

| Variable | Description |
|---|---|
| `STRIPE_SECRET_KEY` | `sk_live_…` (déjà en place) |
| `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` | `pk_live_…` (déjà en place) |
| `STRIPE_WEBHOOK_SECRET` | **À remplir après création du webhook (étape 2)** |
| `CRON_SECRET` | (optionnel) protège le job de prélèvement des échéances |

## 2. Webhook Stripe (après déploiement)

1. Aller sur **https://dashboard.stripe.com/webhooks**
2. **Add endpoint** → URL :
   `https://<votre-domaine>/api/stripe-webhook`
3. Événements à cocher :
   - `payment_intent.succeeded`
   - `payment_intent.payment_failed`
   - `setup_intent.succeeded`
4. Copier le **Signing secret** (`whsec_…`) et le renseigner dans
   `STRIPE_WEBHOOK_SECRET` côté Vercel, puis redéployer.

## 3. SQL Supabase (SQL Editor)

```sql
ALTER TABLE public.adherents
ADD COLUMN IF NOT EXISTS stripe_customer_id text,
ADD COLUMN IF NOT EXISTS stripe_setup_intent_id text,
ADD COLUMN IF NOT EXISTS nb_echeances integer DEFAULT 1,
ADD COLUMN IF NOT EXISTS echeances_payees integer DEFAULT 0,
ADD COLUMN IF NOT EXISTS prochaine_echeance date,
ADD COLUMN IF NOT EXISTS derniere_erreur_stripe text;

CREATE TABLE IF NOT EXISTS public.paiements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  adherent_id uuid REFERENCES public.adherents(id),
  stripe_payment_intent_id text,
  montant numeric,
  statut text DEFAULT 'en_attente',
  numero_echeance integer,
  date_prevue date,
  date_paiement timestamptz,
  created_at timestamptz DEFAULT now()
);
```

> En cas d'alerte RLS sur `paiements`, choisir **« Run and enable RLS »** :
> l'accès se fait uniquement via la clé service role côté serveur.

## 4. Prélèvement automatique des échéances (GitHub Actions Cron)

Le job `GET /api/cron/charge-echeances` prélève chaque jour les échéances dont
la date est atteinte, sur la carte enregistrée (off_session). Il est déclenché
par un workflow GitHub Actions : `.github/workflows/charge-echeances.yml`
(tous les jours à 06:00 UTC, + lancement manuel via `workflow_dispatch`).

**Après le déploiement Vercel**, ajouter ces 2 secrets dans GitHub
(**Repo → Settings → Secrets and variables → Actions → New repository secret**) :

| Secret | Valeur |
|---|---|
| `CRON_SECRET` | la même valeur que dans Vercel |
| `NEXT_PUBLIC_SITE_URL` | `https://<votre-domaine-vercel>` (sans slash final) |

Le job tourne automatiquement chaque matin à 6h UTC et peut être lancé
manuellement depuis l'onglet **Actions** du repo GitHub (workflow
« Charge échéances Stripe » → **Run workflow**).

> Le endpoint exige l'en-tête `Authorization: Bearer <CRON_SECRET>`. Définir
> `CRON_SECRET` côté Vercel **et** côté GitHub avec la même valeur.
> Le cron Vercel a été retiré de `vercel.json` pour éviter les doublons.

## 5. Logique tarifaire (rappel)

- **Sept → déc** : tarif plein.
- **Janv → juin** : proratisé (mois « bonus » : janv 7, févr 6, mars 5,
  avr 4, mai 3, juin 1 × tarif mensuel = tarif annuel / 10).
- **Suppléments** (+30€ adhésion 1ʳᵉ année, +100€ prépa) : toujours prélevés
  **immédiatement** en 1x, jamais étalés.
- **Échéances disponibles** selon les mois réels restants (10 − mois saison) :
  - ≥ 4 → 1x, 2x, 3x, 4x
  - = 3 → 1x, 2x, 3x
  - ≤ 2 → 1x uniquement
- **Dates** : étalées régulièrement de l'inscription jusqu'au 30 juin.

## 6. Mot de passe oublié (Supabase Auth)

La page `/auth/reset-password` reçoit le lien de réinitialisation envoyé par
Supabase. Le lien de redirection utilise l'origine réelle de la requête
(`window.location.origin`), donc aucune variable n'est strictement nécessaire,
mais il faut **autoriser ces URLs** côté Supabase :

**Supabase → Authentication → URL Configuration → Redirect URLs** :
```
http://localhost:3000/auth/reset-password
https://<votre-domaine>/auth/reset-password
```

`.env.local` :
```
NEXT_PUBLIC_SITE_URL=http://localhost:3000
```
> Sur **Vercel**, définir `NEXT_PUBLIC_SITE_URL` avec la **vraie URL de
> production** (ex. `https://punching-boxe.com`). Ne pas laisser `localhost`.

## 7. Emails transactionnels (Resend)

5 emails automatiques (`lib/email.ts`) :
1. **Confirmation adhérent** (inscription espèces/carte) — récap, échéancier si
   fractionné, horaires, salles, lien vers `/mon-espace`.
2. **Notification Pascal** (nouvelle inscription) — vers `ADMIN_NOTIFY_EMAIL`.
3. **Document refusé** (adhérent) — doc concerné + motif + lien espace.
4. **Document mis à jour** (Pascal) — vers `ADMIN_NOTIFY_EMAIL`.
5. **Échec de paiement** (adhérent) — montant, date, lien régularisation.

Variables d'environnement :

| Variable | Description |
|---|---|
| `RESEND_API_KEY` | clé API Resend. **Si absente, aucun email n'est envoyé** (log « Email non envoyé : RESEND_API_KEY manquant »), l'app continue de fonctionner. |
| `RESEND_FROM` | expéditeur (def. `Punching Boxe <noreply@punching-boxe.com>`) |
| `ADMIN_NOTIFY_EMAIL` | destinataire des notifications admin (def. `contact@punching-boxe.com`) |

> **Vérification du domaine** : pour envoyer depuis `@punching-boxe.com`, vérifier
> le domaine dans **Resend → Domains** (ajouter les enregistrements DNS fournis).
> En attendant, pour des **tests locaux**, définir
> `RESEND_FROM="Punching Boxe <onboarding@resend.dev>"` (domaine de test Resend).

## 8. Test

- Cartes de test : https://stripe.com/docs/testing
  (ex. `4242 4242 4242 4242`, 3DS : `4000 0027 6000 3184`).
- Le tableau de bord admin (`/admin/adherents/[id]`) affiche l'échéancier,
  l'encaissé / le reste, et un bouton **Relancer le paiement** en cas d'échec.
