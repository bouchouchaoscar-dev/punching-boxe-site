"use client";

import { adminAuthHeaders, getAdminRole } from "./admin-auth";
import { lundiDeLaSemaine, toISODate } from "./planning";

// Cache de session pour les onglets admin (Planning, Présence) : affiche
// IMMÉDIATEMENT les dernières données connues (paint instantané, comme le fait
// SaisonProvider en mémoire pour les adhérents) puis rafraîchit en arrière-plan.
// sessionStorage → survit aux navigations ET à un rechargement de page, purgé à
// la fermeture de l'onglet. Fail-safe : indisponibilité = pas de cache (jamais
// d'erreur). Ne remplace JAMAIS la gestion d'erreur : une requête en échec reste
// une erreur (cf. useDonneesAdmin), on n'écrase pas le cache avec du vide.
//
// DONNÉES PERSONNELLES (noms, photos, statuts de paiement, y compris mineurs) sur
// un appareil potentiellement PARTAGÉ (accès coach) : deux garde-fous cumulés.
//   1) Clés PRÉFIXÉES PAR LE RÔLE (admin/coach) : aucune lecture croisée possible,
//      même si une purge est oubliée (un coach ne lit jamais le cache admin).
//   2) Purge TOTALE à la déconnexion / au (ré)affichage de la page de login
//      (session invalidée) — cf. purgerCache().
// Le cache coach ne contient que la réponse des endpoints coach (déjà filtrés par
// la liste blanche coach) : les champs sensibles n'y entrent jamais.

const PREFIXE = "pbnp.admin.cache.";

// Clé complète = PRÉFIXE + rôle + clé logique. Rôle inconnu (déconnecté) → pas de
// cache du tout (ni lecture ni écriture).
function cleComplete(cle: string): string | null {
  const role = getAdminRole();
  if (!role) return null;
  return `${PREFIXE}${role}.${cle}`;
}

// Clés de cache (SOURCE UNIQUE, partagées préchargement ↔ pages).
export const CLES = {
  presenceJour: "presence.jour",
  presenceCoach: "presence.coach",
  planningProfs: "planning.profs",
  planningCours: "planning.cours",
  planningPeriodes: "planning.periodes",
  planningAff: (sem: string) => `planning.aff.${sem}`,
  planningEnvoi: (sem: string) => `planning.envoi.${sem}`,
  planningCoach: (sem: string) => `planning.coach.${sem}`,
};

export function lireCache<T>(cle: string): T | null {
  try {
    const k = cleComplete(cle);
    if (!k) return null;
    const brut = window.sessionStorage.getItem(k);
    return brut ? (JSON.parse(brut) as T) : null;
  } catch {
    return null;
  }
}

export function ecrireCache(cle: string, valeur: unknown): void {
  try {
    const k = cleComplete(cle);
    if (!k) return; // pas de rôle → on ne met rien en cache
    window.sessionStorage.setItem(k, JSON.stringify(valeur));
  } catch {
    /* quota / indisponible : on continue sans cache */
  }
}

// Purge TOTALE du cache admin+coach (tous rôles confondus). À appeler à la
// déconnexion, au changement de rôle et à l'invalidation/expiration de session :
// aucune donnée personnelle ne doit survivre sur un appareil partagé.
export function purgerCache(): void {
  try {
    const s = window.sessionStorage;
    const aSupprimer: string[] = [];
    for (let i = 0; i < s.length; i++) {
      const k = s.key(i);
      if (k && k.startsWith(PREFIXE)) aSupprimer.push(k);
    }
    for (const k of aSupprimer) s.removeItem(k);
  } catch {
    /* indisponible : rien à purger */
  }
}

// ---- Préchargement (survol / appui sur l'entrée de menu, ou montage du shell) ----
// Best-effort et silencieux : on réchauffe le cache pour que l'ouverture réelle
// de l'onglet peigne instantanément. Une erreur ici est ignorée (l'ouverture
// réelle, elle, affichera l'erreur via useDonneesAdmin). Dé-doublonnage des
// requêtes en vol.
const enVol = new Set<string>();
async function rechauffer(cle: string, url: string, extraire: (d: unknown) => unknown) {
  if (enVol.has(cle)) return;
  enVol.add(cle);
  try {
    const r = await fetch(url, { headers: adminAuthHeaders(), cache: "no-store" });
    if (!r.ok) return; // best-effort : pas d'écriture de cache sur erreur
    ecrireCache(cle, extraire(await r.json()));
  } catch {
    /* best-effort */
  } finally {
    enVol.delete(cle);
  }
}

type D = Record<string, unknown>;
const arr = (d: unknown, k: string) => (d as D)?.[k] ?? [];

// Précharge les données d'un onglet (Planning / Présence) selon le rôle.
export function prechargerOnglet(href: string, role: string | null): void {
  const coach = role === "coach";
  if (href === "/admin/presence") {
    if (coach) rechauffer(CLES.presenceCoach, "/api/coach/presence", (d) => arr(d, "cours"));
    else rechauffer(CLES.presenceJour, "/api/admin/presence/jour", (d) => arr(d, "cours"));
  } else if (href === "/admin/planning") {
    const sem = toISODate(lundiDeLaSemaine(new Date()));
    if (coach) {
      rechauffer(CLES.planningCoach(sem), `/api/coach/planning?semaine=${sem}`, (d) => ({
        cours: arr(d, "cours"), affectations: arr(d, "affectations"), profs: arr(d, "profs"), periodes: arr(d, "periodes"),
      }));
    } else {
      rechauffer(CLES.planningProfs, "/api/admin/planning/profs", (d) => arr(d, "profs"));
      rechauffer(CLES.planningCours, "/api/admin/planning/cours", (d) => arr(d, "cours"));
      rechauffer(CLES.planningPeriodes, "/api/admin/planning/fermetures", (d) => arr(d, "periodes"));
    }
  }
}
