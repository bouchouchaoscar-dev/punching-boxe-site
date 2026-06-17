# PROJECT.md — Punching Boxe Nogent‑Le Perreux

> Site vitrine + inscription en ligne + espace adhérent + dashboard admin + mailing, pour un club de sport. **Sert de repo MASTER** dupliquable sur d'autres clubs (voir `SETUP-NOUVEAU-CLIENT.md` côté agence).

---

## 1. Stack & infrastructure

| Couche | Choix |
|---|---|
| Framework | **Next.js 15** (App Router, RSC) + TypeScript strict |
| UI | **Tailwind v4** (tokens dans `app/globals.css` `@theme`, pas de `tailwind.config`) + Framer Motion + lucide-react |
| Base / Auth | **Supabase** (Postgres + Auth + Storage). Service role côté serveur (contourne RLS) |
| Paiement | **Stripe** (PaymentIntent comptant + SetupIntent off‑session pour le fractionné) |
| Emails | **Resend** (transactionnels + campagnes) |
| PDF | **@react-pdf/renderer** v4 (rendu serveur, `serverExternalPackages`) |
| Photo | **react-easy-crop** (recadrage 1:1) |
| Hébergement | **Vercel** (déploiement auto sur push `main`) |
| Cron | **cron-job.org** (horaire, fiable) + Vercel cron (quotidien, filet) → `GET /api/cron/charge-echeances` |

**Couleurs** : orange `#FF6B00`, ink `#0A0A0A`, smoke `#6B6B6B`, line `#ECECEC`, paper `#FFFFFF`/`#FAFAFA`. **Polices** : Archivo (display) + Manrope (texte).

**⚠️ Dev local** : développer HORS de `~` (le home est un repo git → Next plante en dev). Chemin SANS espaces. Le repo de travail vit dans `/Users/Shared/punching-boxe-site`.

---

## 2. Architecture (arborescence)

```
app/
  (site)/            pages publiques (accueil, activités, équipe, infos, contact,
                     inscription[, /connexion, /finaliser/[id], /regulariser/[id], /merci],
                     mon-espace, desinscription, mentions/politiques, auth/reset-password)
  admin/             dashboard (adherents[/[id]], anciens, campagnes[...], login)
  api/               routes serveur (voir §4)
  layout.tsx         SEO global (metadataBase, OG, keywords)
  globals.css        design system (@theme Tailwind v4)
components/          ui, home, sections, inscription, espace, admin, infos, contact, auth, legal
lib/                 logique métier PURE + serveur (voir §3)
lib/pdf/             templates React-PDF (fiche, règlement, certificat) + render + génération
scripts/            tests (.mts) + ops (nettoyage, seed, init, check, import anciens)
supabase/           schema.sql (historique) + migrations/001_schema_complet.sql (canon)
.github/workflows/  charge-echeances.yml (cron horaire) + keep-alive.yml
```

---

## 3. Modules métier (lib/) — sources uniques

- **`pricing.ts`** — LA source des tarifs. `TARIFS`, `COTISATION_PALIERS` (dégressif par mois), `PREPA_PALIERS`, `calculerTarif()`, `deduireType()` (jeune <13 dynamique), `estMineur()` (<18 dynamique), `remiseFamillePct()`, `formuleLabel()`, `euro()`.
- **`saison.ts`** — `saisonCourante()` (juin→mai, juin = anticipé), `estJuin()`, `saisonQuiSeTermine()`.
- **`adherents-actifs.ts`** — `estActifCompte()` : **définition CENTRALE** de « actif compté » (non fermé ET engagé/payé/espèces-confirmées OU espèces-en-attente). Réutilisée par segments, dashboard, foyer, stats.
- **`engagement.ts`** — `estEngage()` (1er paiement passé).
- **`dossier.ts`** — `evaluerDossier()` (statut 4 docs) + `badgeDossierAdherent()` (vue adhérent, gradient).
- **`synthese-dossier.ts`** — phrase adaptative de l'espace adhérent (croise docs × paiement).
- **`dossier-complet.ts`** — `notifierSiDossierComplet()` : mail « dossier validé » une seule fois (flag atomique).
- **`anciennete.ts`** — matching anciens importés (`matchKey`), `doitPayerAdhesion()`, `classerAncien()` (chaud/tiède/froid), `SEUIL_ADHESION_GAP=4`.
- **`foyer.ts` / `foyer-server.ts`** — décompte foyer + résolution/fusion `foyer_id` (rattachement explicite uniquement).
- **`pricing` paliers + `tarifs.ts`** — `devisPourAdherent()`, `planEcheances()`, `echeancesAutorisees()`.
- **`payments.ts`** — Stripe serveur : `markAdherentPaid`, `recalculerEtatPaiement`, `chargerEcheance` (off‑session), `annulerEcheances`, `allouerRemboursement`.
- **`email.ts`** — tous les mails (transactionnels + `renderCampagne`). Reply‑To club.
- **`campagnes.ts`** — segments (smart lists), `regrouperParEmail()` (familles), variables `{{...}}` dont `{{recap_reglement}}`.
- **`inscription.ts`** — `InscriptionPayload`, `buildAdherentInsert`, `validatePayload`, `clientIp`.
- **`constants.ts`** — `CLUB`, `SALLES`, `HORAIRES`, `PACKAGES`, `NAV_LINKS`… (infos club).

**Principe** : le **serveur a toujours le dernier mot** sur l'argent et les statuts (tarif recalculé, ancienneté/30€, foyer/remise, montants). Le client n'est qu'un aperçu.

---

## 4. Routes API clés

- **Inscription** : `POST /api/adherents` (espèces), `POST /api/create-payment-intent` (carte) → génèrent les PDF **côté serveur** (parallèle) avant l'insert. `POST /api/confirm-payment`, `POST /api/inscription/anciennete`, `POST /api/famille/verifier`.
- **Documents** : `/api/documents/{fiche-inscription,reglement-interieur,certificat-medical}` (vierges), `/previsualiser` (rempli sans signature, POST), `/generer` (rempli+signé→storage), `/apercu` (test).
- **Espace adhérent** : `/api/mon-espace[...]`, `/finaliser`, `/regulariser[/confirm]`, `/count`.
- **Admin** : `/api/admin/adherents/[id]/{gerer-paiement,annuler,remboursements,historique-ancien}`, `/admin/campagnes[...]`, `/admin/templates`, `/admin/anciens[...]`, `/admin/stats-saisons`, `/admin/login`.
- **Stripe** : `POST /api/stripe-webhook` (6 events, voir §7).
- **Cron** : `GET /api/cron/charge-echeances` (échéances dues + campagnes planifiées ; protégé `Authorization: Bearer CRON_SECRET` ou header Vercel).
- **Santé** : `GET /api/health` (ping keep‑alive Supabase).

---

## 5. Logiques métier détaillées

### Tarifs
- 2 formules (`boxe_classique` 430/410, `savate_prepa` 350/330 adulte/jeune), adhésion +30€ (1ère année / ancien éloigné), option prépa +70€ (BF, **dégressive** sept‑fév 70 / mars‑mai 35 / juin 10), incluse en Savate & Prépa.
- **Dégressivité** = tables de paliers par mois d'inscription (`COTISATION_PALIERS`), pas de prorata ÷10.
- **Remise famille** sur la cotisation : 3ᵉ −10 %, 4ᵉ −15 %, 5ᵉ+ −20 %. **Uniquement** sur rattachement explicite (case cochée + attestation). Partager un compte ne suffit JAMAIS.

### Seuils d'âge (dynamiques, indépendants)
- **Tarif** jeune/adulte = âge < 13 ans à la date d'inscription (décale chaque saison).
- **Autorisation parentale** = mineur < 18 ans. Un 13‑17 ans = **tarif adulte MAIS mineur** (autorisation + règlement signé par le responsable légal).

### Documents signés en ligne
- Fiche + règlement **générés/pré‑remplis** (React‑PDF), **vus dans une modale puis signés** (SignaturePad maison, signature vectorielle SVG), **2 signatures distinctes**. Auto‑validés (PDF système fiables) + trace `*_signee_at` + `signature_ip`.
- Certificat médical : **à faire établir par le médecin**, **non bloquant** pour s'inscrire/payer, mais obligatoire. Photo : recadrée 1:1.
- Pour un **mineur** : règlement au nom du **responsable légal** (process + PDF).

### Paiement
- Carte (1×) = PaymentIntent ; fractionné (2/3/4×) = SetupIntent off‑session + `chargerEcheance` par le cron. Espèces = confirmé par l'admin.
- **`payment_method_types: ["card"]`** → carte + **Apple Pay + Google Pay** uniquement (pas Klarna/Pix/Satispay/Link).
- Remboursement découplé de la clôture ; **CA = encaissé net réel** (paiements payés − remboursés). Mail de remboursement **adaptatif** (canal × total/partiel × clôture × échéances futures).

### Ancienneté / migration
- 858 anciens + 1245 historique importés. Matching `match_key` (nom sans accents | prénom | naissance). `gap` = saisons depuis la dernière active : gap≤1 chaud, 2‑3 tiède (exonéré 30€), **≥4 froid (repaie 30€)**. Migration = `ancien_id` posé (exclut des relances anciens).

### Cron / campagnes
- `charge-echeances` (horaire via cron-job.org) prélève les échéances dues (jamais les fermées → statut `annule`) et envoie les campagnes planifiées (`scheduled_at ≤ now`, statut `planifiee`, `etat=active`). Idempotent (claims atomiques).

---

## 6. Données (voir `supabase/migrations/001_schema_complet.sql`)
Tables : `adherents` (cœur, ~60 colonnes), `paiements`, `remboursements`, `profiles`, `anciens_adherents`, `historique_saisons`, `campagnes`, `templates_mail`, `contacts_mailing`, `desinscriptions_mailing`, `admin_users`. RLS activé partout sans policy publique. Bucket storage public `adherents-documents` (`{uuidClient}/{photo,fiche,reglement,certificat_medical}`).

> ⚠️ Le **dossier de stockage** porte un UUID **client** (dans les `*_url`), distinct de l'`id` DB. En nettoyage sélectif, préserver le dossier via les URLs, pas via l'id DB.

---

## 7. Déploiement — points critiques (détail dans `SETUP-NOUVEAU-CLIENT.md`)
- **`NEXT_PUBLIC_SITE_URL` = `https://www.<domaine>`** (l'apex redirige 308 → www ; cibler www partout, secret GitHub inclus, sinon le cron meurt sur la redirection).
- **Webhook Stripe live** → `https://www.<domaine>/api/stripe-webhook`, 6 events : `payment_intent.succeeded`, `payment_intent.payment_failed`, `setup_intent.succeeded`, `charge.refunded`, `charge.dispute.created`, `charge.dispute.closed`.
- **Supabase Auth** → Site URL + Redirect URLs sur le domaine final.
- **Apple Pay** → enregistrer le domaine dans Stripe (Payment Method Domains), même mode (test/live), accès via le domaine enregistré.
- **Resend** → domaine vérifié (SPF/DKIM dans OVH). `RESEND_FROM` + `ADMIN_NOTIFY_EMAIL`.
- **cron-job.org** → `GET .../api/cron/charge-echeances` + header `Authorization: Bearer <CRON_SECRET>`.
- Vérif : `npx tsx scripts/check-deployment.mts`.

---

## 8. Jalons (hashes de référence)
| Hash | Étape |
|---|---|
| `6f3d28c` | Tarifs Savate & Prépa + option prépa |
| `152c90f` | Dégressivité par tables de paliers |
| `5b333ee` | Helper central `estActifCompte` |
| `15031cf`→`a91eb3f` | Documents remplis & signés en ligne (5 étapes) |
| `d00a850` | Voir puis signer chaque document (modale) |
| `28951bb` | Génération PDF fusionnée côté serveur (perf) |
| `b59110c` | Mail de remboursement adaptatif |
| `2010eaa` | Seuils d'âge dynamiques + indépendants |
| `03fe8ea` | Remise famille uniquement sur rattachement explicite |
| `04a01db` | Paiement carte + Apple/Google Pay (rien d'autre) |
| `68fcb14` | Variable mailing `{{recap_reglement}}` (famille) |

---

## 9. Tests (`scripts/test-*.mts`, via `npx tsx`)
`test-pricing` (126 cas), `test-foyer-rattachement`, `test-anciennete` (26), `test-mail-remboursement`, `test-recap-reglement`, `test-segments-mailing` (17), `test-remboursement-alloc`, `test-coherence-actifs`, `test-stats-saisons`, `test-regroupement-famille`, `test-filtres`, `test-desinscription`, `test-echec`. Ops : `audit-coherence` (read‑only), `nettoyage-base` / nettoyage sélectif, `sim-cron-echeance`, `import-anciens`.

---

## 10. Statut
**LIVE** sur `www.punching-boxe.com`. Première vraie inscription carte encaissée (Assiya Nina). Plusieurs inscriptions en 24 h sans mailing — bon signal PMF.
