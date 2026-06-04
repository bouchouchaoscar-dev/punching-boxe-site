"use client";

import { useEffect, useRef, useState } from "react";
import { normalizePostal } from "@/lib/format";

type Suggestion = { city: string; postcode: string };

export function PostalCityFields({
  codePostal,
  setCodePostal,
  ville,
  setVille,
}: {
  codePostal: string;
  setCodePostal: (v: string) => void;
  ville: string;
  setVille: (v: string) => void;
}) {
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);
  const lastQuery = useRef<string>("");

  // Fermeture au clic extérieur
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [open]);

  // Recherche des communes quand le CP fait 5 chiffres
  useEffect(() => {
    if (codePostal.length !== 5) {
      setSuggestions([]);
      setOpen(false);
      return;
    }
    if (lastQuery.current === codePostal) return;
    lastQuery.current = codePostal;

    const controller = new AbortController();
    const t = setTimeout(async () => {
      setLoading(true);
      try {
        const res = await fetch(
          `https://api-adresse.data.gouv.fr/search/?q=${codePostal}&type=municipality&limit=5`,
          { signal: controller.signal },
        );
        if (!res.ok) throw new Error("api");
        const data = await res.json();
        const seen = new Set<string>();
        const list: Suggestion[] = [];
        for (const f of data.features ?? []) {
          const p = f.properties ?? {};
          const city: string = p.city ?? p.name ?? p.label ?? "";
          const postcode: string = p.postcode ?? codePostal;
          if (!city || seen.has(city)) continue;
          seen.add(city);
          list.push({ city, postcode });
        }

        if (list.length === 1) {
          // Une seule commune → remplissage auto, sans liste
          setVille(list[0].city);
          setSuggestions([]);
          setOpen(false);
        } else if (list.length > 1) {
          setSuggestions(list);
          setOpen(true);
        } else {
          setSuggestions([]);
          setOpen(false);
        }
      } catch {
        /* réseau / abort : on ignore silencieusement */
      } finally {
        setLoading(false);
      }
    }, 250);

    return () => {
      controller.abort();
      clearTimeout(t);
    };
  }, [codePostal, setVille]);

  function choose(s: Suggestion) {
    setVille(s.city);
    if (s.postcode) setCodePostal(s.postcode);
    setOpen(false);
  }

  return (
    <>
      <div className="relative" ref={wrapRef}>
        <label className="block">
          <span className="mb-1.5 block text-sm font-semibold text-ink">
            Code postal
          </span>
          <input
            value={codePostal}
            inputMode="numeric"
            onChange={(e) => setCodePostal(normalizePostal(e.target.value))}
            onFocus={() => suggestions.length > 1 && setOpen(true)}
            placeholder="94130"
            className="focus-ring w-full rounded-xl border border-line bg-paper-2 px-4 py-3 text-ink outline-none transition-colors focus:border-orange"
          />
        </label>

        {open && suggestions.length > 0 && (
          <ul className="absolute left-0 right-0 top-full z-30 mt-1.5 max-h-56 overflow-auto rounded-xl border border-line bg-white py-1 shadow-[0_20px_45px_-20px_rgba(0,0,0,0.35)]">
            {loading && (
              <li className="px-4 py-2 text-xs text-smoke">Recherche…</li>
            )}
            {suggestions.map((s) => (
              <li key={`${s.city}-${s.postcode}`}>
                <button
                  type="button"
                  onClick={() => choose(s)}
                  className="flex w-full items-center justify-between px-4 py-2.5 text-left text-sm text-ink transition-colors hover:bg-orange-50 hover:text-orange-600"
                >
                  <span className="font-medium">{s.city}</span>
                  <span className="text-xs text-smoke">{s.postcode}</span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      <label className="block">
        <span className="mb-1.5 block text-sm font-semibold text-ink">Ville</span>
        <input
          value={ville}
          onChange={(e) => setVille(e.target.value)}
          placeholder="Nogent-sur-Marne"
          className="focus-ring w-full rounded-xl border border-line bg-paper-2 px-4 py-3 text-ink outline-none transition-colors focus:border-orange"
        />
      </label>
    </>
  );
}
