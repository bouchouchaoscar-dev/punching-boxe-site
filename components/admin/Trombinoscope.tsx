"use client";

import { useMemo, useState } from "react";
import { useSaisonAdmin } from "./SaisonContext";
import { adminAuthHeaders } from "@/lib/admin-auth";
import { estActifCompte } from "@/lib/adherents-actifs";
import { estPaiementSolde } from "@/lib/paiement";
import { formuleLabel } from "@/lib/pricing";
import type { Adherent } from "@/lib/types";

const initiales = (a: Adherent) =>
  `${(a.prenom || "").trim()[0] ?? ""}${(a.nom || "").trim()[0] ?? ""}`.toUpperCase() ||
  "?";

export function Trombinoscope() {
  const { adherents, loading, selectedSaison } = useSaisonAdmin();
  const [exporting, setExporting] = useState(false);

  // Actifs (source unique) de la saison sélectionnée (déjà filtrée par le
  // contexte), triés par NOM A→Z.
  const actifs = useMemo(
    () =>
      adherents
        .filter(estActifCompte)
        .sort(
          (a, b) =>
            (a.nom || "").localeCompare(b.nom || "", "fr", {
              sensitivity: "base",
            }) ||
            (a.prenom || "").localeCompare(b.prenom || "", "fr", {
              sensitivity: "base",
            }),
        ),
    [adherents],
  );

  async function exportPdf() {
    setExporting(true);
    try {
      const res = await fetch(
        `/api/admin/trombinoscope?saison=${encodeURIComponent(selectedSaison)}`,
        { headers: adminAuthHeaders() },
      );
      if (!res.ok) throw new Error();
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `trombinoscope-punching-boxe.pdf`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
    } catch {
      alert("L'export PDF a échoué. Réessayez.");
    } finally {
      setExporting(false);
    }
  }

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl font-extrabold uppercase text-ink">
            Trombinoscope
          </h1>
          <p className="mt-1 text-sm text-smoke">
            {actifs.length} adhérent{actifs.length > 1 ? "s" : ""} actif
            {actifs.length > 1 ? "s" : ""}
          </p>
        </div>
        <button
          onClick={exportPdf}
          disabled={exporting || actifs.length === 0}
          className="rounded-full bg-orange px-4 py-2.5 text-sm font-bold text-white transition-colors hover:brightness-95 disabled:opacity-50"
        >
          {exporting ? "Génération…" : "Exporter en PDF"}
        </button>
      </div>

      {loading ? (
        <div className="mt-10 flex justify-center">
          <span className="h-8 w-8 animate-spin rounded-full border-2 border-ink/20 border-t-orange" />
        </div>
      ) : actifs.length === 0 ? (
        <p className="mt-10 text-center text-sm text-smoke">
          Aucun adhérent actif pour cette sélection.
        </p>
      ) : (
        <div className="mt-6 grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
          {actifs.map((a) => {
            const paye = estPaiementSolde(a);
            return (
              <div
                key={a.id}
                className="overflow-hidden rounded-2xl border border-line bg-white"
              >
                <div className="relative aspect-square bg-paper-2">
                  {a.photo_url ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={a.photo_url}
                      alt={`${a.prenom} ${a.nom}`}
                      className="h-full w-full object-cover"
                    />
                  ) : (
                    <div className="flex h-full items-center justify-center font-display text-4xl font-black text-line">
                      {initiales(a)}
                    </div>
                  )}
                </div>
                <div className="p-3">
                  <p className="truncate text-sm font-bold text-ink">
                    {a.prenom} {a.nom}
                  </p>
                  <p className="mt-0.5 truncate text-xs text-smoke">
                    {formuleLabel(a.package, a.option_prepa_physique)}
                  </p>
                  <div className="mt-1.5 flex items-center gap-1.5">
                    <span
                      className={`h-2.5 w-2.5 rounded-full ${
                        paye ? "bg-green-500" : "bg-orange"
                      }`}
                    />
                    <span
                      className={`text-xs font-semibold ${
                        paye ? "text-green-600" : "text-orange"
                      }`}
                    >
                      {paye ? "Payé" : "En cours"}
                    </span>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
