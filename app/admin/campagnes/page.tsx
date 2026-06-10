"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { adminAuthHeaders } from "@/lib/admin-auth";
import type { Campagne } from "@/lib/campagnes";

const STATUT_BADGE: Record<string, { label: string; cls: string }> = {
  envoye: { label: "✅ Envoyé", cls: "bg-green-50 text-green-700" },
  brouillon: { label: "📝 Brouillon", cls: "bg-orange-50 text-orange-600" },
  erreur: { label: "❌ Erreur", cls: "bg-red-50 text-red-700" },
  planifiee: { label: "🕓 Planifiée", cls: "bg-blue-50 text-blue-700" },
  en_cours: { label: "⏳ Envoi en cours", cls: "bg-blue-50 text-blue-700" },
};

const TYPE_BADGE: Record<string, { label: string; cls: string }> = {
  campagne: { label: "Campagne", cls: "bg-orange-50 text-orange" },
  individuel: { label: "Individuel", cls: "bg-paper-2 text-ink/70" },
};

function dateHeure(iso: string): string {
  const d = new Date(iso);
  return `${d.toLocaleDateString("fr-FR")} ${d.toLocaleTimeString("fr-FR", {
    hour: "2-digit",
    minute: "2-digit",
  })}`;
}

export default function CampagnesPage() {
  const router = useRouter();
  const [campagnes, setCampagnes] = useState<Campagne[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(() => {
    fetch("/api/admin/campagnes", { headers: adminAuthHeaders(), cache: "no-store" })
      .then((r) => r.json())
      .then((d) => setCampagnes(d.campagnes ?? []))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);
  useEffect(() => {
    load();
  }, [load]);

  async function togglePause(c: Campagne) {
    setBusy(c.id);
    try {
      await fetch(`/api/admin/campagnes/${c.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", ...adminAuthHeaders() },
        body: JSON.stringify({ etat: c.etat === "pause" ? "active" : "pause" }),
      });
      load();
    } finally {
      setBusy(null);
    }
  }
  async function supprimer(c: Campagne) {
    if (!confirm(`Supprimer la campagne planifiée « ${c.objet} » ?`)) return;
    setBusy(c.id);
    try {
      await fetch(`/api/admin/campagnes/${c.id}`, {
        method: "DELETE",
        headers: adminAuthHeaders(),
      });
      load();
    } finally {
      setBusy(null);
    }
  }

  return (
    <div>
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-display text-4xl font-black uppercase text-ink">
            Historique des envois
          </h1>
          <p className="mt-1 text-smoke">
            Campagnes, mails individuels et envois planifiés, du plus récent au
            plus ancien.
          </p>
        </div>
        <div className="flex flex-wrap gap-3">
          <Link
            href="/admin/campagnes/templates"
            className="rounded-full border border-line bg-white px-5 py-2.5 text-sm font-semibold text-ink transition-colors hover:border-ink"
          >
            Templates
          </Link>
          <Link
            href="/admin/campagnes/nouvelle?planifier=1"
            className="rounded-full border border-line bg-white px-5 py-2.5 text-sm font-semibold text-ink transition-colors hover:border-orange hover:text-orange"
          >
            🕓 Planifier une campagne
          </Link>
          <Link
            href="/admin/campagnes/nouvelle"
            className="rounded-full bg-orange px-5 py-2.5 text-sm font-bold text-white transition-colors hover:bg-orange/90"
          >
            + Nouvelle campagne
          </Link>
        </div>
      </div>

      <div className="mt-8 overflow-x-auto rounded-[1.5rem] border border-line bg-white">
        {loading ? (
          <div className="flex h-40 items-center justify-center">
            <span className="h-7 w-7 animate-spin rounded-full border-2 border-ink/20 border-t-orange" />
          </div>
        ) : campagnes.length === 0 ? (
          <div className="p-12 text-center text-smoke">
            Aucun envoi pour le moment.
          </div>
        ) : (
          <table className="w-full min-w-[48rem] text-left text-sm">
            <thead>
              <tr className="border-b border-line text-xs uppercase tracking-wide text-smoke">
                <th className="p-4 font-bold">Date</th>
                <th className="p-4 font-bold">Type</th>
                <th className="p-4 font-bold">Objet</th>
                <th className="p-4 font-bold">Destinataires</th>
                <th className="p-4 font-bold">Statut</th>
                <th className="p-4 font-bold"></th>
              </tr>
            </thead>
            <tbody>
              {campagnes.map((c) => {
                const planifiee =
                  c.statut === "planifiee" || c.statut === "en_cours";
                const b = STATUT_BADGE[c.statut] ?? STATUT_BADGE.brouillon;
                const t = TYPE_BADGE[c.type ?? "campagne"] ?? TYPE_BADGE.campagne;
                const individuel = c.type === "individuel";
                return (
                  <tr
                    key={c.id}
                    onClick={() => router.push(`/admin/campagnes/${c.id}`)}
                    className="cursor-pointer border-b border-line transition-colors last:border-0 hover:bg-paper-2"
                  >
                    <td className="whitespace-nowrap p-4 text-smoke">
                      {planifiee && c.scheduled_at ? (
                        <>
                          <span className="block text-xs uppercase tracking-wide text-blue-600">
                            Prévu
                          </span>
                          {dateHeure(c.scheduled_at)}
                        </>
                      ) : (
                        dateHeure(c.envoye_at ?? c.created_at)
                      )}
                    </td>
                    <td className="p-4">
                      <span
                        className={`inline-flex whitespace-nowrap rounded-full px-2.5 py-1 text-xs font-bold ${t.cls}`}
                      >
                        {t.label}
                      </span>
                    </td>
                    <td className="p-4">
                      <span className="font-semibold text-ink">{c.objet}</span>
                      {c.cible && (
                        <span className="mt-0.5 block text-xs text-smoke">
                          {c.cible}
                        </span>
                      )}
                    </td>
                    <td className="p-4 text-smoke">
                      {planifiee
                        ? "—"
                        : individuel
                          ? "1"
                          : (
                            <>
                              {c.nb_destinataires ?? 0}
                              {c.nb_envoyes != null && (
                                <span className="block text-xs text-smoke/70">
                                  {c.nb_envoyes} email{c.nb_envoyes > 1 ? "s" : ""}
                                </span>
                              )}
                            </>
                          )}
                    </td>
                    <td className="p-4">
                      <span
                        className={`inline-flex whitespace-nowrap rounded-full px-2.5 py-1 text-xs font-bold ${b.cls}`}
                      >
                        {b.label}
                      </span>
                      {planifiee && c.etat === "pause" && (
                        <span className="mt-1 block text-xs font-semibold text-amber-600">
                          ⏸ en pause
                        </span>
                      )}
                    </td>
                    <td className="p-4 text-right">
                      {c.statut === "planifiee" && (
                        <div
                          className="flex justify-end gap-2"
                          onClick={(e) => e.stopPropagation()}
                        >
                          <button
                            onClick={() => togglePause(c)}
                            disabled={busy === c.id}
                            className="rounded-lg border border-line px-2.5 py-1 text-xs font-semibold text-ink transition-colors hover:border-orange hover:text-orange disabled:opacity-50"
                          >
                            {c.etat === "pause" ? "Reprendre" : "Pause"}
                          </button>
                          <button
                            onClick={() => supprimer(c)}
                            disabled={busy === c.id}
                            className="rounded-lg border border-line px-2.5 py-1 text-xs font-semibold text-red-600 transition-colors hover:border-red-300 hover:bg-red-50 disabled:opacity-50"
                          >
                            Supprimer
                          </button>
                        </div>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
