# SEO — Checklist post-déploiement · Punching Boxe Nogent-Le Perreux

Site : https://punching-boxe-site.vercel.app
(à remplacer par https://punching-boxe.com une fois le domaine connecté à Vercel)

## ✅ Déjà en place dans le code
- **Redirections 301** des anciennes URLs WordPress → nouvelles pages
  (`next.config.ts`). Préserve le « jus » SEO de l'ancien site.
- **Metadata optimisées** par page (title + description + mots-clés cibles).
- **Canonical URLs** sur chaque page (`alternates.canonical`).
- **Open Graph + Twitter Card** (fr_FR, image hero) sur toutes les pages.
- **Schema.org `SportsClub`** (adresse, geo, horaires, prix, sports, salles).
- **Schema.org `FAQPage`** sur `/infos` (6 questions).
- **Sitemap** dynamique `/sitemap.xml` (toutes les pages publiques).
- **robots.txt** : tout autorisé sauf `/admin` et `/api`.
- **Page `/a-propos`** (histoire, chiffres clés, disciplines, zone géographique)
  pour le référencement et l'optimisation IA (AIO).
- **next/image** partout, `priority` sur les images above-the-fold.
- **H1 unique** par page, hiérarchie H2/H3 cohérente.

## 📋 À faire manuellement (post-déploiement)

### 1. Google Search Console
- [ ] Ajouter la propriété (domaine) : https://search.google.com/search-console
- [ ] Vérifier la propriété (DNS ou balise meta).
- [ ] Soumettre le sitemap : `https://<domaine>/sitemap.xml`
- [ ] Demander l'indexation de la page d'accueil + pages clés.

### 2. Google Business Profile (ex-Google My Business)
- [ ] Créer / revendiquer la fiche : https://business.google.com
- [ ] Catégorie : « Club de boxe » / « Salle de sport ».
- [ ] NAP cohérent : **Punching Boxe Nogent-Le Perreux**,
      19 bis rue Paul Bert, 94130 Nogent-sur-Marne, 06 10 81 49 98.
- [ ] Ajouter photos, horaires, lien vers le site.

### 3. Citations locales / liens
- [ ] Mettre à jour le lien sur le **site de la Ville de Nogent-sur-Marne**
      (annuaire des associations / clubs sportifs).
- [ ] Idem **Ville du Perreux-sur-Marne** et **Office des sports / CDOS 94**.
- [ ] Vérifier la fiche sur les annuaires fédéraux (FFSavate).

### 4. Backlinks (anciens référents)
- [ ] Contacter les sites qui pointent vers l'ancien `punching-boxe.com`
      pour mettre à jour leurs liens vers les nouvelles URLs.
- [ ] Réseaux sociaux (Facebook / Instagram) : mettre le lien du site à jour.

### 5. Suivi de positionnement
- [ ] Surveiller le ranking sur les mots-clés cibles :
  - club boxe française Nogent-sur-Marne
  - boxe française Val-de-Marne
  - cours boxe Nogent Le Perreux
  - savate fitness Nogent
  - cours préparation physique Nogent
  - cardio training Val-de-Marne
  - club sport Nogent-sur-Marne
  - cours boxe enfants adultes 94
- [ ] Outils : Google Search Console (requêtes), + un suivi de rang
      (Ubersuggest, SE Ranking, etc.).

### 6. Domaine personnalisé
- [ ] Connecter `punching-boxe.com` au projet Vercel
      (Settings → Domains) une fois la migration validée.
- [ ] Mettre à jour `NEXT_PUBLIC_SITE_URL` (Vercel) avec le domaine final
      → canonicals, sitemap, OG et Schema basculent automatiquement dessus.
- [ ] Re-soumettre le sitemap dans Search Console avec le nouveau domaine.
