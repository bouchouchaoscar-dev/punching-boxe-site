@AGENTS.md

# Punching Boxe — Guide projet (lu à chaque session)

> Site + inscription en ligne + espace adhérent + admin + mailing, club de sport.
> Détail complet : `PROJECT.md`. Repo MASTER dupliquable (cf. `SETUP-NOUVEAU-CLIENT.md` côté agence).

## État actuel
**LIVE** sur `https://www.punching-boxe.com` — 3+ inscriptions en prod (dont un **fractionné 3× validé**), 1ʳᵉ campagne de relance envoyée (**186 destinataires, 100 % délivrabilité**). PMF validé. **Resend Pro** activé. **Tunnel de conversion complet et automatisé** (voir ci‑dessous).

## Stack & repo
Next.js 15 (App Router, TS) · Supabase (DB/Auth/Storage) · Stripe · Resend · @react-pdf · Tailwind v4 · Vercel · cron-job.org.
Repo : `github.com/bouchouchaoscar-dev/punching-boxe-site` · **local de travail : `/Users/Shared/punching-boxe-site`** (hors `~`, sans espaces).

## Fonctionnalités livrées (résumé)
Vitrine + SEO (301 de l'ancien WP) · inscription 100 % en ligne (1 compte = N dossiers) · tarifs dégressifs par paliers + adhésion + option prépa + remise famille (rattachement explicite) · seuils d'âge dynamiques (tarif <13, autorisation <18) · documents générés + **signés en ligne** (auto‑validés, certificat non bloquant, photo recadrée) · paiement Stripe carte/fractionné/espèces + **Apple/Google Pay** · espace adhérent (messages adaptatifs) · dashboard admin (validation pièces, paiement, **remboursement/clôture découplés, CA net réel**) · anciens (réinscription, 858+1245 importés) · **mailing** (segments, templates, planification, familles) · crons (échéances + campagnes).

## Automatisations conversion & mailing (récent ✅)
- **Relance panier abandonné** : dossier carte/fractionné créé mais non finalisé (engage_at null) depuis > 24 h → mail auto unique (cron), flag `adherents.relance_panier_envoyee_at`.
- **Relance compte orphelin** : compte Auth sans aucun dossier depuis > 24 h → mail auto unique (cron), anti‑doublon via table `relances_compte` (profiles vide au signup → table dédiée).
- **Mail dossier complet** : engagé + 4 docs validés → une seule fois, flag `mail_dossier_complet_envoye`.
- **Envoi campagnes durci** : envoi un‑par‑un + **pacing 300 ms** (rate‑limit Resend 5 req/s), **retry 1× sur 429**, erreurs **non avalées** → statut **`partiel`** si échecs, **suivi par destinataire** dans table `envois_mailing`, `nb_envoyes` réel.
- **UI admin** : « Template » → « **Modèle** ». Nouveau modèle **« Relance — Paiement non finalisé »** + jeton `{{bouton_finaliser}}`.

## Backlog post‑lancement
- [ ] Marquer en base les **5 adresses bounce** identifiées (Resend Logs) — pas de webhook bounce encore (envois_mailing ne capte que les échecs d'envoi, pas les bounces async).
- [ ] Google Search Console (soumettre `sitemap.xml`) + indexation.
- [ ] Google Business Profile (fiche club) + avis.
- [ ] Réseaux : remplacer les URLs Facebook/Instagram placeholder dans `lib/constants.ts` (`CLUB.facebook/instagram`) + `sameAs` JSON‑LD.
- [ ] Vérifier **Apple Pay en prod** (domaine enregistré dans Stripe, mode live).
- [ ] Suivre les 1ères **échéances fractionnées réelles** prélevées par le cron.
- [ ] Photos pro / contenus complémentaires si fournis par le club.

## Comment travailler ici
- Avancer par **lots** ; chaque lot = `npm run build` vert → **push** (sur OK) → donner le **hash**.
- **Plan d'abord** sur les changements gros/risqués ; attendre l'OK avant de coder.
- Tests : `npx tsx scripts/test-*.mts` — **verts obligatoires** pour toute logique d'argent.
- Le user teste sur **Vercel** (pas en local). Textes du site **sans tiret cadratin** « — » (virgule).
- Opération **irréversible** (prod, suppression) : récap chiffré → **GO explicite** → exécuter → confirmer.

## Points de vigilance critiques (ne jamais X sans Y)
- **Ne jamais cibler l'apex** dans crons/secrets → toujours `https://www.punching-boxe.com` (apex 308→www casse le cron).
- **Ne jamais toucher à l'argent/aux statuts côté client** sans que le **serveur recalcule** (tarif, ancienneté/30€, foyer/remise).
- **Ne jamais mettre en dur** une valeur qui varie (seuils d'âge, tarifs, URL) → `lib/pricing.ts`, config.
- **Ne jamais supprimer en prod** sans récap + GO ; préserver le storage **via les URLs** (dossier = UUID client ≠ id DB).
- **Ne jamais utiliser `automatic_payment_methods`** pour le paiement → `payment_method_types: ["card"]` (Apple/Google Pay sans Klarna/Pix).
- **Ne jamais dupliquer une notion** (actif, tarif, libellé) → source unique (`estActifCompte`, `lib/pricing.ts`, `formuleLabel`).
- **Ne jamais faire circuler les secrets** (admin, `CRON_SECRET`) ; le user clique en UI, je vérifie en base.

## Liens utiles
- Domaine : https://www.punching-boxe.com · Santé : `/api/health`
- Vercel : projet `punching-boxe-site` (deploy auto sur push `main`)
- Supabase : projet `psbakyyjsogkfawtpxbc`
- Stripe : dashboard (mode **live**) → webhook `/api/stripe-webhook` (6 events) + Payment Method Domains (Apple Pay)
- Resend : domaine `punching-boxe.com` (SPF/DKIM OVH)
- Cron : cron-job.org → `GET /api/cron/charge-echeances` (header `Authorization: Bearer CRON_SECRET`)
- GitHub : `bouchouchaoscar-dev/punching-boxe-site` · Docs agence : `bouchouchaoscar-dev/assopilotagence-digitale`
