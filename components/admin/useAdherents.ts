"use client";

import { useCallback, useEffect, useState } from "react";
import type { Adherent } from "@/lib/types";
import { adminAuthHeaders } from "@/lib/admin-auth";

export function useAdherents() {
  const [adherents, setAdherents] = useState<Adherent[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const refresh = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const res = await fetch("/api/adherents", {
        headers: adminAuthHeaders(),
        cache: "no-store",
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Erreur de chargement.");
      setAdherents(data.adherents || []);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erreur inconnue.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  return { adherents, loading, error, refresh };
}
