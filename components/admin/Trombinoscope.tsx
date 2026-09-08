"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { useSaisonAdmin } from "./SaisonContext";
import { adminAuthHeaders } from "@/lib/admin-auth";
import { estActifCompte } from "@/lib/adherents-actifs";
import { statutTrombi } from "@/lib/paiement";
import { formuleLabel, PACKAGE_LABEL } from "@/lib/pricing";
import { formaterPrenom, formaterNom } from "@/lib/noms";
import type { Adherent } from "@/lib/types";

const initiales = (a: Adherent) =>
  `${(a.prenom || "").trim()[0] ?? ""}${(a.nom || "").trim()[0] ?? ""}`.toUpperCase() ||
  "?";

const DOT_BG: Record<"vert" | "orange" | "rouge", string> = {
  vert: "bg-green-500",
  orange: "bg-orange",
  rouge: "bg-red-500",
};
const DOT_TX: Record<"vert" | "orange" | "rouge", string> = {
  vert: "text-green-600",
  orange: "text-orange",
  rouge: "text-red-600",
};

export function Trombinoscope() {
  const { adherents, loading, selectedSaison } = useSaisonAdmin();
  const [exporting, setExporting] = useState(false);

  // Filtres combinables.
  const [q, setQ] = useState("");
  const [type, setType] = useState("all"); // all | jeune | adulte
  const [statut, setStatut] = useState("all"); // all | paye | fractionne | attente_especes | echec
  const [formule, setFormule] = useState("all"); // all | <package>

  // Actifs (source unique) triés par NOM A→Z.
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

  const packages = useMemo(
    () => [...new Set(actifs.map((a) => a.package))],
    [actifs],
  );

  // Filtrage multi-critères, réactif (côté client).
  const filtres = useMemo(
    () =>
      actifs.filter((a) => {
        if (type !== "all" && a.type_adherent !== type) return false;
        if (formule !== "all" && a.package !== formule) return false;
        if (statut !== "all") {
          const c = statutTrombi(a).code;
          if (statut === "paye") {
            if (c !== "paye_carte" && c !== "paye_especes") return false;
          } else if (c !== statut) {
            return false;
          }
        }
        if (q.trim()) {
          const s = `${a.prenom} ${a.nom}`.toLowerCase();
          if (!s.includes(q.trim().toLowerCase())) return false;
        }
        return true;
      }),
    [actifs, type, formule, statut, q],
  );

  async function exportPdf() {
    setExporting(true);
    try {
      const res = await fetch(`/api/admin/trombinoscope`, {
        method: "POST",
        headers: { ...adminAuthHeaders(), "Content-Type": "application/json" },
        body: JSON.stringify({
          ids: filtres.map((a) => a.id),
          saison: selectedSaison,
        }),
      });
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

  const selCls =
    "rounded-full border border-line bg-white px-3 py-2 text-sm text-ink outline-none focus:border-orange";

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl font-extrabold uppercase text-ink">
            Trombinoscope
          </h1>
          <p className="mt-1 text-sm text-smoke">
            {filtres.length} adhérent{filtres.length > 1 ? "s" : ""}
            {filtres.length !== actifs.length ? ` / ${actifs.length}` : ""}
          </p>
        </div>
        <button
          onClick={exportPdf}
          disabled={exporting || filtres.length === 0}
          className="rounded-full bg-orange px-4 py-2.5 text-sm font-bold text-white transition-colors hover:brightness-95 disabled:opacity-50"
        >
          {exporting ? "Génération…" : "Exporter en PDF"}
        </button>
      </div>

      {/* Filtres combinables */}
      <div className="mt-5 flex flex-wrap gap-2">
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Rechercher un nom…"
          className={`${selCls} min-w-[180px] flex-1`}
        />
        <select value={type} onChange={(e) => setType(e.target.value)} className={selCls}>
          <option value="all">Tous âges</option>
          <option value="jeune">Jeunes</option>
          <option value="adulte">Adultes</option>
        </select>
        <select value={statut} onChange={(e) => setStatut(e.target.value)} className={selCls}>
          <option value="all">Tous statuts</option>
          <option value="paye">Payé</option>
          <option value="fractionne">Fractionné en cours</option>
          <option value="attente_especes">Attente espèces</option>
          <option value="echec">Prélèvement échoué</option>
        </select>
        <select value={formule} onChange={(e) => setFormule(e.target.value)} className={selCls}>
          <option value="all">Toutes formules</option>
          {packages.map((p) => (
            <option key={p} value={p}>
              {PACKAGE_LABEL[p] ?? p}
            </option>
          ))}
        </select>
      </div>

      {loading ? (
        <div className="mt-10 flex justify-center">
          <span className="h-8 w-8 animate-spin rounded-full border-2 border-ink/20 border-t-orange" />
        </div>
      ) : filtres.length === 0 ? (
        <p className="mt-10 text-center text-sm text-smoke">
          Aucun adhérent ne correspond à ces filtres.
        </p>
      ) : (
        <div className="mt-6 grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
          {filtres.map((a) => {
            const st = statutTrombi(a);
            return (
              <Link
                key={a.id}
                href={`/admin/adherents/${a.id}`}
                className="focus-ring group block overflow-hidden rounded-2xl border border-line bg-white transition-all duration-200 hover:-translate-y-0.5 hover:border-orange/40 hover:shadow-lg"
              >
                <div className="relative aspect-square overflow-hidden bg-paper-2">
                  {a.photo_url ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={a.photo_url}
                      alt={`${a.prenom} ${a.nom}`}
                      className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
                    />
                  ) : (
                    <div className="flex h-full items-center justify-center font-display text-4xl font-black text-line">
                      {initiales(a)}
                    </div>
                  )}
                </div>
                <div className="p-3">
                  <p className="truncate text-sm font-bold text-ink">
                    {formaterPrenom(a.prenom)} {formaterNom(a.nom)}
                  </p>
                  <p className="mt-0.5 truncate text-xs text-smoke">
                    {formuleLabel(a.package, a.option_prepa_physique)}
                  </p>
                  <div className="mt-1.5 flex items-center gap-1.5">
                    <span
                      className={`h-2.5 w-2.5 shrink-0 rounded-full ${DOT_BG[st.couleur]}`}
                    />
                    <span
                      className={`truncate text-xs font-semibold ${DOT_TX[st.couleur]}`}
                    >
                      {st.label}
                    </span>
                  </div>
                </div>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
