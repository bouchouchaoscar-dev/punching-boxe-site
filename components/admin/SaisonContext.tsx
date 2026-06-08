"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import type { Adherent } from "@/lib/types";
import { saisonCourante } from "@/lib/saison";

// Sentinelle "toutes saisons" + clé de persistance du choix.
export const ALL_SAISONS = "all";
const STORAGE_KEY = "admin.saison";

type Ctx = {
  allAdherents: Adherent[];
  adherents: Adherent[]; // déjà filtré par la saison sélectionnée
  loading: boolean;
  error: string;
  refresh: () => Promise<void>;
  saisons: string[]; // saisons réelles présentes (sans le sentinel)
  selectedSaison: string; // saison réelle OU ALL_SAISONS
  setSelectedSaison: (s: string) => void;
};

const SaisonContext = createContext<Ctx | null>(null);

export function SaisonProvider({ children }: { children: React.ReactNode }) {
  const [allAdherents, setAllAdherents] = useState<Adherent[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  // Défaut = saison courante ; éventuel choix mémorisé chargé côté client.
  const [selectedSaison, setSelectedSaisonState] = useState<string>(() =>
    saisonCourante(new Date()),
  );

  useEffect(() => {
    const stored = window.localStorage.getItem(STORAGE_KEY);
    if (stored) setSelectedSaisonState(stored);
  }, []);

  const setSelectedSaison = useCallback((s: string) => {
    setSelectedSaisonState(s);
    try {
      window.localStorage.setItem(STORAGE_KEY, s);
    } catch {
      /* localStorage indisponible : on garde le choix en mémoire seulement */
    }
  }, []);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const res = await fetch("/api/adherents", { cache: "no-store" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Erreur de chargement.");
      setAllAdherents(data.adherents || []);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erreur inconnue.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  // Saisons présentes ∪ saison courante, triées décroissant (plus récente en 1er).
  const saisons = useMemo(() => {
    const set = new Set<string>();
    for (const a of allAdherents) if (a.saison) set.add(a.saison);
    set.add(saisonCourante(new Date()));
    return [...set].sort().reverse();
  }, [allAdherents]);

  // Si le choix mémorisé n'existe plus (et n'est pas "toutes"), revenir à la courante.
  useEffect(() => {
    if (selectedSaison === ALL_SAISONS) return;
    if (saisons.length > 0 && !saisons.includes(selectedSaison)) {
      setSelectedSaisonState(saisonCourante(new Date()));
    }
  }, [saisons, selectedSaison]);

  const adherents = useMemo(() => {
    if (selectedSaison === ALL_SAISONS) return allAdherents;
    return allAdherents.filter((a) => a.saison === selectedSaison);
  }, [allAdherents, selectedSaison]);

  return (
    <SaisonContext.Provider
      value={{
        allAdherents,
        adherents,
        loading,
        error,
        refresh,
        saisons,
        selectedSaison,
        setSelectedSaison,
      }}
    >
      {children}
    </SaisonContext.Provider>
  );
}

export function useSaisonAdmin() {
  const ctx = useContext(SaisonContext);
  if (!ctx)
    throw new Error("useSaisonAdmin doit être utilisé dans <SaisonProvider>.");
  return ctx;
}

// Sélecteur global de saison (mobile-first). Rendu dans AdminShell.
export function SaisonSelect({ className = "" }: { className?: string }) {
  const { saisons, selectedSaison, setSelectedSaison } = useSaisonAdmin();
  return (
    <select
      value={selectedSaison}
      onChange={(e) => setSelectedSaison(e.target.value)}
      aria-label="Filtrer par saison"
      className={`rounded-full border border-line bg-white px-3 py-2 text-sm font-semibold text-ink outline-none focus:border-orange ${className}`}
    >
      {saisons.map((s) => (
        <option key={s} value={s}>
          Saison {s}
        </option>
      ))}
      <option value={ALL_SAISONS}>Toutes les saisons</option>
    </select>
  );
}
