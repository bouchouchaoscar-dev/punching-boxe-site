# Punching Boxe de Nogent-Le Perreux — Site & Gestion des inscriptions

Site vitrine + inscriptions en ligne + dashboard admin pour le club de Boxe
Française & Savate de Nogent / Le Perreux.

**Stack** : Next.js 16 (App Router) · TypeScript · Tailwind v4 · Supabase ·
Stripe · Resend · @react-pdf/renderer · Recharts · Framer Motion.

Direction artistique : **Blanc + Orange (#FF6B00) + Noir**, style premium
inspiré Apple. Typo : Archivo (display) + Manrope (texte).

---

## 🚀 Démarrage local

```bash
npm install --legacy-peer-deps
cp .env.example .env.local   # puis remplir les clés
npm run dev                  # http://localhost:3000
```

> `--legacy-peer-deps` est nécessaire (React 19 + quelques libs).

Le site fonctionne **sans aucune clé** (mode démo) : les PDF se génèrent, les
pages s'affichent. Les fonctions Supabase/Stripe/Resend se dégradent
proprement tant que les variables ne sont pas renseignées.

---

## 🔑 Variables d'environnement

| Variable | Rôle |
|---|---|
| `NEXT_PUBLIC_SITE_URL` | URL publique (SEO, emails) |
| `NEXT_PUBLIC_SUPABASE_URL` | Projet Supabase |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Clé anon Supabase |
| `SUPABASE_SERVICE_ROLE_KEY` | Clé service role (serveur, écritures) |
| `STRIPE_SECRET_KEY` | Clé secrète Stripe |
| `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` | Clé publique Stripe |
| `STRIPE_WEBHOOK_SECRET` | Secret du webhook Stripe |
| `NEXT_PUBLIC_FORMSPREE_ID` | ID Formspree (formulaire contact) |
| `RESEND_API_KEY` | Clé API Resend |
| `RESEND_FROM` | Expéditeur des emails |
| `ADMIN_NOTIFY_EMAIL` | Destinataire des notifications (Pascal) |
| `NEXT_PUBLIC_ADMIN_EMAIL` | Identifiant de connexion admin |
| `ADMIN_PASSWORD` | Mot de passe admin |

---

## 🗄️ Base de données

Exécuter [`supabase/schema.sql`](./supabase/schema.sql) dans le **SQL Editor**
de Supabase. Cela crée les tables `adherents` et `admin_users`, le bucket
`adherents-documents` et les politiques de lecture publique.

---

## 💳 Stripe

- Paiement **1x** : `PaymentIntent` du montant total.
- Paiement **2x/3x/4x** : `PaymentIntent` de la 1ère échéance + carte
  enregistrée (`setup_future_usage`) ; les échéances suivantes sont à
  planifier (cf. *Prochaines étapes*).
- Webhook : pointer `https://VOTRE-DOMAINE/api/stripe-webhook` sur
  l'événement `payment_intent.succeeded`, puis renseigner
  `STRIPE_WEBHOOK_SECRET`.

---

## 🔐 Admin

`/admin/login` — connexion (compte unique : `NEXT_PUBLIC_ADMIN_EMAIL` +
`ADMIN_PASSWORD`). Session en `localStorage`. Tableau de bord (KPIs +
graphiques), liste des adhérents (recherche / filtres / export CSV), fiche
détaillée, confirmation des paiements espèces.

---

## 📄 Pages & routes

**Public** : `/` · `/activites` · `/equipe` · `/infos` · `/contact` ·
`/inscription` · `/inscription/merci`
**Admin** : `/admin` · `/admin/adherents` · `/admin/adherents/[id]` · `/admin/login`
**Documents PDF** : `/api/documents/{fiche-inscription|certificat-medical|reglement-interieur}`

---

## ☁️ Déploiement Vercel

Connecter le repo GitHub à Vercel, ajouter les variables d'environnement,
déployer. `npm run build` doit passer (vérifié ✅).
