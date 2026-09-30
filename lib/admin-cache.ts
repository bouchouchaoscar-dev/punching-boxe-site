"use client";

import { adminAuthHeaders } from "./admin-auth";
import { lundiDeLaSemaine, toISODate } from "./planning";

// Cache de session pour les onglets admin (Planning, Présence) : affiche
// IMMÉDIATEMENT les dernières données connues (paint instantané, comme le fait
// SaisonProvider en mémoire pour les adhérents) puis rafraîchit en arrière-plan.
// sessionStorage → survit aux navigations ET à un rechargement de page, purgé à
// la fermeture de l'onglet. Fail-safe : indisponibilité = pas de cache (jamais
// d'erreur). Ne remplace JAMAIS la gestion d'erreur : une requête en échec reste
// une erreur (cf. useDonneesAdmin), on n'écrase pas le cache avec du vide.

const PREFIXE = "pbnp.admin.cache.";

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
    const brut = window.sessionStorage.getItem(PREFIXE + cle);
    return brut ? (JSON.parse(brut) as T) : null;
  } catch {
    return null;
  }
}

export function ecrireCache(cle: string, valeur: unknown): void {
  try {
    window.sessionStorage.setItem(PREFIXE + cle, JSON.stringify(valeur));
  } catch {
    /* quota / indisponible : on continue sans cache */
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
