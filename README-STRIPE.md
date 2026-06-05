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

## 4. Prélèvement automatique des échéances (Vercel Cron)

Le job `GET /api/cron/charge-echeances` prélève chaque jour les échéances dont
la date est atteinte, sur la carte enregistrée (off_session).

- Planifié dans `vercel.json` : tous les jours à 06:00 UTC.
- Disponible sur les plans Vercel supportant les Cron Jobs.
- Si `CRON_SECRET` est défini, le job exige l'en-tête
  `Authorization: Bearer <CRON_SECRET>` (Vercel Cron est autorisé via
  l'en-tête `x-vercel-cron`).

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

## 7. Test

- Cartes de test : https://stripe.com/docs/testing
  (ex. `4242 4242 4242 4242`, 3DS : `4000 0027 6000 3184`).
- Le tableau de bord admin (`/admin/adherents/[id]`) affiche l'échéancier,
  l'encaissé / le reste, et un bouton **Relancer le paiement** en cas d'échec.
