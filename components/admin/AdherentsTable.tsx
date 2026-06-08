"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useSaisonAdmin } from "./SaisonContext";
import { PaiementStatut } from "./StatutBadge";
import { euro } from "@/lib/pricing";
import { evaluerDossier } from "@/lib/dossier";
import type { Adherent } from "@/lib/types";

export function AdherentsTable() {
  const { adherents, loading, error, refresh } = useSaisonAdmin();
  const [q, setQ] = useState("");
  const [type, setType] = useState("all");
  const [statut, setStatut] = useState("all");
  const [prepa, setPrepa] = useState("all");
  const [confirming, setConfirming] = useState<string | null>(null);
  const [encaisseMap, setEncaisseMap] = useState<Record<string, number>>({});
  const [paidEcheancesMap, setPaidEcheancesMap] = useState<
    Record<string, number>
  >({});

  // Somme encaissée + nombre d'échéances payées (par adhérent).
  useEffect(() => {
    fetch("/api/paiements", { cache: "no-store" })
      .then((r) => r.json())
      .then((d) => {
        const enc: Record<string, number> = {};
        const paid: Record<string, number> = {};
        for (const p of (d.paiements ?? []) as {
          adherent_id: string;
          montant: number;
          statut: string;
          numero_echeance: number | null;
        }[]) {
          if (p.statut === "paye") {
            enc[p.adherent_id] =
              (enc[p.adherent_id] ?? 0) + Number(p.montant || 0);
            // X = échéances NUMÉROTÉES payées (exclut la ligne adhésion numero=null).
            if (p.numero_echeance != null)
              paid[p.adherent_id] = (paid[p.adherent_id] ?? 0) + 1;
          }
        }
        setEncaisseMap(enc);
        setPaidEcheancesMap(paid);
      })
      .catch(() => {});
  }, []);

  const filtered = useMemo(() => {
    return adherents.filter((a) => {
      const matchQ =
        !q ||
        `${a.prenom} ${a.nom}`.toLowerCase().includes(q.toLowerCase()) ||
        a.email.toLowerCase().includes(q.toLowerCase());
      const matchType = type === "all" || a.type_adherent === type;
      const matchStatut = statut === "all" || a.statut_paiement === statut;
      const matchPrepa =
        prepa === "all" ||
        (prepa === "oui" ? a.option_prepa_physique : !a.option_prepa_physique);
      return matchQ && matchType && matchStatut && matchPrepa;
    });
  }, [adherents, q, type, statut, prepa]);

  async function confirmCash(id: string) {
    setConfirming(id);
    try {
      await fetch(`/api/adherents/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "confirmer_especes" }),
      });
      await refresh();
    } finally {
      setConfirming(null);
    }
  }

  function exportCsv() {
    const headers = [
      "Nom",
      "Prénom",
      "Email",
      "Téléphone",
      "Type",
      "Formule",
      "Statut",
      "Mode",
      "Montant",
      "Prépa",
      "Date",
    ];
    const rows = filtered.map((a) => [
      a.nom,
      a.prenom,
      a.email,
      a.telephone ?? "",
      a.type_adherent,
      a.package === "savate_prepa" ? "Savate et Prépa" : "Boxe Française",
      a.statut_paiement,
      a.mode_paiement,
      String(a.montant_total),
      a.option_prepa_physique ? "oui" : "non",
      new Date(a.created_at).toLocaleDateString("fr-FR"),
    ]);
    const csv = [headers, ...rows]
      .map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(";"))
      .join("\n");
    const blob = new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `adherents-punching-boxe.csv`;
    link.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div>
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-display text-4xl font-black uppercase text-ink">
            Adhérents
          </h1>
          <p className="mt-1 text-smoke">
            {filtered.length} / {adherents.length} adhérent
            {adherents.length > 1 ? "s" : ""}
          </p>
        </div>
        <button
          onClick={exportCsv}
          disabled={!filtered.length}
          className="rounded-full border border-line bg-white px-5 py-2.5 text-sm font-semibold text-ink transition-colors hover:border-ink disabled:opacity-40"
        >
          Exporter CSV
        </button>
      </div>

      {/* Filtres */}
      <div className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Rechercher un nom, email…"
          className="focus-ring rounded-xl border border-line bg-white px-4 py-2.5 text-sm outline-none focus:border-orange"
        />
        <Select value={type} onChange={setType} options={[["all", "Tous types"], ["adulte", "Adultes"], ["jeune", "Jeunes"]]} />
        <Select value={statut} onChange={setStatut} options={[["all", "Tous statuts"], ["paye", "Payé en ligne"], ["confirme_especes", "Espèces confirmé"], ["en_attente", "En attente"]]} />
        <Select value={prepa} onChange={setPrepa} options={[["all", "Prépa : tous"], ["oui", "Avec prépa"], ["non", "Sans prépa"]]} />
      </div>

      {error && (
        <div className="mt-6 rounded-xl bg-amber-50 p-4 text-sm text-amber-800">
          {error}
        </div>
      )}

      {/* Table */}
      <div className="mt-6 overflow-x-auto rounded-[1.5rem] border border-line bg-white">
        {loading ? (
          <div className="flex h-40 items-center justify-center">
            <span className="h-7 w-7 animate-spin rounded-full border-2 border-ink/20 border-t-orange" />
          </div>
        ) : filtered.length === 0 ? (
          <div className="p-12 text-center text-smoke">Aucun adhérent trouvé.</div>
        ) : (
          <table className="w-full min-w-[58rem] table-fixed text-left text-sm">
            <colgroup>
              <col className="w-[192px]" />
              <col className="w-[68px]" />
              <col className="w-[156px]" />
              <col className="w-[88px]" />
              <col className="w-[92px]" />
              <col className="w-[100px]" />
              <col className="w-[84px]" />
              <col className="w-[148px]" />
            </colgroup>
            <thead>
              <tr className="border-b border-line text-xs uppercase tracking-wide text-smoke">
                <th className="px-3 py-3 text-left font-bold">Adhérent</th>
                <th className="px-2 py-3 text-center font-bold">Type</th>
                <th className="px-2 py-3 text-center font-bold">Statut</th>
                <th className="px-2 py-3 text-center font-bold">Montant</th>
                <th className="px-2 py-3 text-center font-bold">Encaissé</th>
                <th className="px-2 py-3 text-center font-bold">Options</th>
                <th className="px-2 py-3 text-center font-bold">Date</th>
                <th className="px-2 py-3 text-center font-bold">Action</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((a) => (
                <Row
                  key={a.id}
                  a={a}
                  encaisse={encaisseMap[a.id] ?? 0}
                  paidEcheances={paidEcheancesMap[a.id] ?? 0}
                  confirming={confirming === a.id}
                  onConfirm={() => confirmCash(a.id)}
                />
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

function Row({
  a,
  encaisse,
  paidEcheances,
  confirming,
  onConfirm,
}: {
  a: Adherent;
  encaisse: number;
  paidEcheances: number;
  confirming: boolean;
  onConfirm: () => void;
}) {
  // Badge "Nouveau" : inscrit depuis moins de 48h ET jamais consulté par l'admin.
  // Dès que la fiche est ouverte (vu_par_admin = true), le badge disparaît définitivement.
  const isNew =
    !a.vu_par_admin &&
    Date.now() - new Date(a.created_at).getTime() < 48 * 60 * 60 * 1000;
  return (
    <tr className="border-b border-line align-middle last:border-0 hover:bg-paper-2">
      <td className="px-3 py-3">
        <Link href={`/admin/adherents/${a.id}`} className="flex items-center gap-2.5">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center overflow-hidden rounded-full bg-paper-2 text-xs font-bold text-smoke">
            {a.photo_url ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={a.photo_url} alt="" className="h-full w-full object-cover" />
            ) : (
              `${a.prenom[0] ?? ""}${a.nom[0] ?? ""}`
            )}
          </span>
          <span className="block min-w-0 flex-1">
            <span className="flex items-center gap-1.5 font-semibold text-ink">
              <span className="truncate">
                {a.prenom} {a.nom}
              </span>
              {isNew && (
                <span className="shrink-0 rounded-full bg-orange px-1.5 py-0.5 text-[0.55rem] font-bold uppercase tracking-wide text-white">
                  New
                </span>
              )}
            </span>
            <span className="block truncate text-xs text-smoke">{a.email}</span>
          </span>
        </Link>
      </td>
      <td className="px-2 py-3 text-center capitalize text-smoke">
        {a.type_adherent}
      </td>
      <td className="px-2 py-3">
        <div className="flex flex-col items-center gap-1.5">
          <PaiementStatut adherent={a} paidEcheances={paidEcheances} />
          <DocsBadge statut={evaluerDossier(a).statut} />
        </div>
      </td>
      <td className="px-2 py-3 text-center font-display font-bold tabular-nums text-ink">
        {euro(a.montant_total)}
      </td>
      <td className="px-2 py-3 text-center font-display font-bold tabular-nums text-green-600">
        {euro(encaisse)}
      </td>
      <td className="truncate px-2 py-3 text-center text-xs text-smoke">
        {a.package === "savate_prepa" ? "Savate et Prépa" : "Boxe Française"}
        {a.option_prepa_physique ? " · Prépa" : ""}
        {a.nouveau_membre ? " · Nouveau" : ""}
      </td>
      <td className="whitespace-nowrap px-2 py-3 text-center text-xs text-smoke">
        {new Date(a.created_at).toLocaleDateString("fr-FR")}
      </td>
      <td className="px-2 py-3 text-center">
        {a.mode_paiement === "especes" && a.statut_paiement === "en_attente" ? (
          <button
            onClick={onConfirm}
            disabled={confirming}
            className="whitespace-nowrap rounded-full bg-ink px-2 py-1 text-xs font-bold text-white transition-colors hover:bg-orange disabled:opacity-50"
          >
            {confirming ? "…" : "Confirmer espèces"}
          </button>
        ) : (
          <Link
            href={`/admin/adherents/${a.id}`}
            className="text-xs font-bold text-orange"
          >
            Voir →
          </Link>
        )}
      </td>
    </tr>
  );
}

// Badge documents à 3 états (aligné sur evaluerDossier).
function DocsBadge({ statut }: { statut: "valide" | "presque" | "incomplet" }) {
  const map = {
    valide: { cls: "bg-green-100 text-green-700", label: "Docs ✓" },
    presque: { cls: "bg-orange-50 text-orange", label: "Docs ⚠️" },
    incomplet: { cls: "bg-red-100 text-red-700", label: "Docs ⏳" },
  }[statut];
  return (
    <span
      className={`inline-flex items-center rounded-full px-2 py-0.5 text-[0.65rem] font-bold ${map.cls}`}
    >
      {map.label}
    </span>
  );
}

function Select({
  value,
  onChange,
  options,
}: {
  value: string;
  onChange: (v: string) => void;
  options: [string, string][];
}) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="focus-ring rounded-xl border border-line bg-white px-4 py-2.5 text-sm outline-none focus:border-orange"
    >
      {options.map(([v, l]) => (
        <option key={v} value={v}>
          {l}
        </option>
      ))}
    </select>
  );
}
