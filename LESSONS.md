# LESSONS — pièges appris sur ce projet

Règles nées de bugs réels. À relire avant de toucher au paiement, aux relances
ou aux requêtes Supabase.

## Une requête en échec ne vaut JAMAIS zéro résultat

Motif dangereux :

```ts
const { data } = await supabase.from("adherents").select(...);
const rows = data ?? [];            // ❌ une requête EN ÉCHEC devient []
```

Quand `error` n'est pas lu, une requête cassée (colonne absente après une
migration non appliquée, RLS, coupure réseau, JSON invalide) renvoie
`data = null`, et le `?? []` la transforme en **liste vide silencieuse**. Le code
conclut alors « aucun dossier / aucune échéance / aucun destinataire » et prend
une décision fausse sans le moindre signal.

Cas réel : `relancerDossiersSansPaiement` sélectionnait `relance_dossier_1_at`
avant que la migration 016 ne soit appliquée → la requête échouait, `data ?? []`
donnait `[]`, et le compte rendu annonçait « 0 dossier éligible » alors que deux
dossiers l'étaient.

**Règle** : toute requête Supabase doit lire `error`. Une erreur **remonte**
(throw / log explicite / état d'erreur affiché) ; elle ne se transforme jamais
en résultat vide.

- **Argent** (prélèvements, échéances, remboursements, statuts, webhooks, crons)
  et **mails/relances** : `throw` (ou log explicite + arrêt), jamais un `[]` muet.
- **Affichage admin/coach** : afficher un **état d'erreur lisible**, pas « 0 »
  ni une liste vide trompeuse.

Helper partagé : `exigerData(await supabase…, "contexte")` dans
[`lib/supabase.ts`](lib/supabase.ts) — lit `error`, lève si présent, renvoie
`data` (qui peut rester `null` pour un `.maybeSingle()` « introuvable » légitime,
à gérer par l'appelant).

```ts
import { exigerData } from "@/lib/supabase";
const rows = exigerData(
  await supabase.from("adherents").select("id").eq("saison", s),
  "relance dossiers: select adherents",
); // une requête en échec lève ici au lieu de valoir []
```
