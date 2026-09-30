"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { adminAuthHeaders } from "@/lib/admin-auth";
import { lireCache, ecrireCache, purgerCache } from "@/lib/admin-cache";

// Hook de chargement des onglets admin avec CACHE DE SESSION (Planning, Présence,
// vues coach). Même esprit que SaisonProvider pour les adhérents :
//   1) paint INSTANTANÉ des dernières données connues (cache de session) ;
//   2) rafraîchissement IMMÉDIAT en arrière-plan (et périodique si intervalMs) ;
//   3) l'erreur REMONTE (jamais une liste vide silencieuse) : on n'écrase jamais
//      le cache ni les données affichées avec du vide sur échec.
export function useDonneesAdmin<T>(
  cle: string,
  url: string,
  extraire: (d: unknown) => T,
  opts?: { intervalMs?: number; actif?: boolean },
) {
  const actif = opts?.actif !== false;
  const intervalMs = opts?.intervalMs;
  const [data, setData] = useState<T | null>(() => (actif ? lireCache<T>(cle) : null));
  const [error, setError] = useState("");
  const [refreshing, setRefreshing] = useState(false);
  // Réf pour garder `refresh` stable même si `extraire` est une lambda inline.
  const extraireRef = useRef(extraire);
  extraireRef.current = extraire;

  const refresh = useCallback(async () => {
    setRefreshing(true);
    try {
      const r = await fetch(url, { headers: adminAuthHeaders(), cache: "no-store" });
      // Session invalidée / expirée côté serveur → on purge le cache (données
      // personnelles) avant même de traiter la réponse.
      if (r.status === 401 || r.status === 403) {
        purgerCache();
        throw new Error("Session expirée. Reconnectez-vous.");
      }
      const d = await r.json();
      if (!r.ok) throw new Error((d as { error?: string })?.error || "Erreur de chargement.");
      const val = extraireRef.current(d);
      setData(val);
      setError("");
      ecrireCache(cle, val);
    } catch (e) {
      // On garde les données déjà affichées (cache) mais on SIGNALE l'erreur.
      setError(e instanceof Error ? e.message : "Erreur inconnue.");
    } finally {
      setRefreshing(false);
    }
  }, [url, cle]);

  useEffect(() => {
    if (!actif) return;
    refresh();
    if (!intervalMs) return;
    const t = setInterval(refresh, intervalMs);
    return () => clearInterval(t);
  }, [refresh, actif, intervalMs]);

  return { data, error, refreshing, refresh, setData };
}
