"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useAdherents } from "./useAdherents";
import { StatutBadge } from "./StatutBadge";
import { euro } from "@/lib/pricing";
import type { Adherent } from "@/lib/types";

export function AdherentsTable() {
  const { adherents, loading, error, refresh } = useAdherents();
  const [q, setQ] = useState("");
  const [type, setType] = useState("all");
  const [statut, setStatut] = useState("all");
  const [prepa, setPrepa] = useState("all");
  const [confirming, setConfirming] = useState<string | null>(null);

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
          <table className="w-full min-w-[52rem] text-left text-sm">
            <thead>
              <tr className="border-b border-line text-xs uppercase tracking-wide text-smoke">
                <th className="p-4 font-bold">Adhérent</th>
                <th className="p-4 font-bold">Type</th>
                <th className="p-4 font-bold">Statut</th>
                <th className="p-4 font-bold">Montant</th>
                <th className="p-4 font-bold">Options</th>
                <th className="p-4 font-bold">Date</th>
                <th className="p-4 font-bold" />
              </tr>
            </thead>
            <tbody>
              {filtered.map((a) => (
                <Row
                  key={a.id}
                  a={a}
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
  confirming,
  onConfirm,
}: {
  a: Adherent;
  confirming: boolean;
  onConfirm: () => void;
}) {
  return (
    <tr className="border-b border-line last:border-0 hover:bg-paper-2">
      <td className="p-4">
        <Link href={`/admin/adherents/${a.id}`} className="flex items-center gap-3">
          <span className="flex h-9 w-9 items-center justify-center overflow-hidden rounded-full bg-paper-2 text-xs font-bold text-smoke">
            {a.photo_url ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={a.photo_url} alt="" className="h-full w-full object-cover" />
            ) : (
              `${a.prenom[0] ?? ""}${a.nom[0] ?? ""}`
            )}
          </span>
          <span>
            <span className="block font-semibold text-ink">
              {a.prenom} {a.nom}
            </span>
            <span className="block text-xs text-smoke">{a.email}</span>
          </span>
        </Link>
      </td>
      <td className="p-4 capitalize text-smoke">{a.type_adherent}</td>
      <td className="p-4">
        <StatutBadge statut={a.statut_paiement} />
      </td>
      <td className="p-4 font-display font-bold text-ink">{euro(a.montant_total)}</td>
      <td className="p-4 text-xs text-smoke">
        {a.option_prepa_physique ? "Prépa physique" : "—"}
        {a.nouveau_membre ? " · Nouveau" : ""}
      </td>
      <td className="p-4 text-smoke">
        {new Date(a.created_at).toLocaleDateString("fr-FR")}
      </td>
      <td className="p-4 text-right">
        {a.statut_paiement === "en_attente" ? (
          <button
            onClick={onConfirm}
            disabled={confirming}
            className="whitespace-nowrap rounded-full bg-ink px-3 py-1.5 text-xs font-bold text-white transition-colors hover:bg-orange disabled:opacity-50"
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
