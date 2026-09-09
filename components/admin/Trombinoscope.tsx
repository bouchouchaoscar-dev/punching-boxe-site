"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useSaisonAdmin } from "./SaisonContext";
import { adminAuthHeaders, getAdminRole } from "@/lib/admin-auth";
import { estActifCompte } from "@/lib/adherents-actifs";
import { statutTrombi } from "@/lib/paiement";
import { formuleLabel, PACKAGE_LABEL } from "@/lib/pricing";
import { formaterPrenom, formaterNom } from "@/lib/noms";
import type { Adherent } from "@/lib/types";

type Couleur = "vert" | "orange" | "rouge";

// Modèle d'affichage UNIFIÉ (admin + coach). En admin, `href` mène à la fiche
// et les données viennent du contexte ; en coach, `href` est null (non
// cliquable) et les données viennent de /api/coach/trombinoscope (minimal).
type TrombiItem = {
  key: string;
  href: string | null;
  prenom: string;
  nom: string;
  formule: string;
  pkg: string; // code formule (filtre)
  type: string; // jeune | adulte (filtre)
  statutCode: string; // filtre
  statutCouleur: Couleur;
  statutLabel: string;
  photo: string | null; // admin: URL ; coach: data-URI
  initiales: string;
};

// Payload du endpoint coach (données publiques uniquement).
type MembreCoach = {
  prenom: string;
  nom: string;
  formule: string;
  package: string;
  type: string;
  statutLabel: string;
  statutCouleur: Couleur;
  statutCode: string;
  photo: string | null;
  initiales: string;
};

const DOT_BG: Record<Couleur, string> = {
  vert: "bg-green-500",
  orange: "bg-orange",
  rouge: "bg-red-500",
};
const DOT_TX: Record<Couleur, string> = {
  vert: "text-green-600",
  orange: "text-orange",
  rouge: "text-red-600",
};

const initialesDe = (prenom: string, nom: string) =>
  `${(prenom || "").trim()[0] ?? ""}${(nom || "").trim()[0] ?? ""}`.toUpperCase() ||
  "?";

function itemFromAdherent(a: Adherent): TrombiItem {
  const st = statutTrombi(a);
  return {
    key: a.id,
    href: `/admin/adherents/${a.id}`,
    prenom: formaterPrenom(a.prenom),
    nom: formaterNom(a.nom),
    formule: formuleLabel(a.package, a.option_prepa_physique),
    pkg: a.package,
    type: a.type_adherent,
    statutCode: st.code,
    statutCouleur: st.couleur,
    statutLabel: st.label,
    photo: a.photo_url,
    initiales: initialesDe(a.prenom, a.nom),
  };
}

function itemFromCoach(m: MembreCoach, i: number): TrombiItem {
  return {
    key: `c${i}`,
    href: null, // coach : non cliquable
    prenom: m.prenom,
    nom: m.nom,
    formule: m.formule,
    pkg: m.package,
    type: m.type,
    statutCode: m.statutCode,
    statutCouleur: m.statutCouleur,
    statutLabel: m.statutLabel,
    photo: m.photo,
    initiales: m.initiales,
  };
}

export function Trombinoscope() {
  const { adherents, loading: adminLoading, selectedSaison } = useSaisonAdmin();

  // Rôle résolu côté client (localStorage). Détermine la source de données et
  // l'interactivité des cartes.
  const [role, setRole] = useState<string | null>(null);
  useEffect(() => setRole(getAdminRole()), []);
  const isCoach = role === "coach";

  const [exporting, setExporting] = useState(false);

  // Filtres combinables.
  const [q, setQ] = useState("");
  const [type, setType] = useState("all"); // all | jeune | adulte
  const [statut, setStatut] = useState("all"); // all | paye | fractionne | attente_especes | echec
  const [formule, setFormule] = useState("all"); // all | <package>

  // Données coach — chargées UNIQUEMENT en mode coach, depuis l'endpoint
  // minimal. La vue coach n'appelle jamais /api/adherents ni useSaisonAdmin()
  // pour les données membres.
  const [coachMembres, setCoachMembres] = useState<MembreCoach[]>([]);
  const [coachLoading, setCoachLoading] = useState(true);
  useEffect(() => {
    if (!isCoach) return;
    setCoachLoading(true);
    fetch(
      `/api/coach/trombinoscope?saison=${encodeURIComponent(selectedSaison)}`,
      { headers: adminAuthHeaders(), cache: "no-store" },
    )
      .then((r) => r.json())
      .then((d) => setCoachMembres(d.membres ?? []))
      .catch(() => setCoachMembres([]))
      .finally(() => setCoachLoading(false));
  }, [isCoach, selectedSaison]);

  // Liste d'items unifiée (triée A→Z) selon le rôle.
  const actifs = useMemo<TrombiItem[]>(() => {
    if (isCoach) return coachMembres.map(itemFromCoach); // déjà triés serveur
    return adherents
      .filter(estActifCompte)
      .map(itemFromAdherent)
      .sort(
        (a, b) =>
          a.nom.localeCompare(b.nom, "fr", { sensitivity: "base" }) ||
          a.prenom.localeCompare(b.prenom, "fr", { sensitivity: "base" }),
      );
  }, [isCoach, coachMembres, adherents]);

  const loading = isCoach ? coachLoading : adminLoading;

  const packages = useMemo(
    () => [...new Set(actifs.map((a) => a.pkg))],
    [actifs],
  );

  // Filtrage multi-critères, réactif (côté client) — identique admin/coach.
  const filtres = useMemo(
    () =>
      actifs.filter((a) => {
        if (type !== "all" && a.type !== type) return false;
        if (formule !== "all" && a.pkg !== formule) return false;
        if (statut !== "all") {
          const c = a.statutCode;
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
        // Admin : liste d'ids EXACTEMENT affichée. Coach : pas d'ids (pas
        // d'accès aux ids) → roster complet de la saison.
        body: JSON.stringify(
          isCoach
            ? { saison: selectedSaison }
            : { ids: filtres.map((a) => a.key), saison: selectedSaison },
        ),
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

      {/* Filtres combinables — mobile : recherche pleine largeur puis selects
          2 par ligne (grid-cols-2). Desktop (lg) inchangé : flex sur une ligne. */}
      <div className="mt-5 grid grid-cols-2 gap-2 lg:flex lg:flex-wrap">
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Rechercher un nom…"
          className={`${selCls} col-span-2 min-w-[180px] lg:col-auto lg:flex-1`}
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
              {PACKAGE_LABEL[p as keyof typeof PACKAGE_LABEL] ?? p}
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
            const carte = (
              <>
                <div className="relative aspect-square overflow-hidden bg-paper-2">
                  {a.photo ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={a.photo}
                      alt={`${a.prenom} ${a.nom}`}
                      loading="lazy"
                      decoding="async"
                      className={`h-full w-full object-cover ${
                        a.href
                          ? "transition-transform duration-300 group-hover:scale-105"
                          : ""
                      }`}
                    />
                  ) : (
                    <div className="flex h-full items-center justify-center font-display text-4xl font-black text-line">
                      {a.initiales}
                    </div>
                  )}
                </div>
                <div className="p-3">
                  <p className="truncate text-sm font-bold text-ink">
                    {a.prenom} {a.nom}
                  </p>
                  <p className="mt-0.5 truncate text-xs text-smoke">
                    {a.formule}
                  </p>
                  <div className="mt-1.5 flex items-center gap-1.5">
                    <span
                      className={`h-2.5 w-2.5 shrink-0 rounded-full ${DOT_BG[a.statutCouleur]}`}
                    />
                    <span
                      className={`truncate text-xs font-semibold ${DOT_TX[a.statutCouleur]}`}
                    >
                      {a.statutLabel}
                    </span>
                  </div>
                </div>
              </>
            );

            // Admin : carte cliquable + animation de survol. Coach : carte
            // statique (pas de <Link>, pas de hover).
            return a.href ? (
              <Link
                key={a.key}
                href={a.href}
                className="focus-ring group block overflow-hidden rounded-2xl border border-line bg-white transition-all duration-200 hover:-translate-y-0.5 hover:border-orange/40 hover:shadow-lg"
              >
                {carte}
              </Link>
            ) : (
              <div
                key={a.key}
                className="block overflow-hidden rounded-2xl border border-line bg-white"
              >
                {carte}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
