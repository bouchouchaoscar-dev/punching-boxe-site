"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { adminAuthHeaders } from "@/lib/admin-auth";
import type { Campagne } from "@/lib/campagnes";

const STATUT_BADGE: Record<string, { label: string; cls: string }> = {
  envoye: { label: "✅ Envoyé", cls: "bg-green-50 text-green-700" },
  brouillon: { label: "📝 Brouillon", cls: "bg-orange-50 text-orange-600" },
  erreur: { label: "❌ Erreur", cls: "bg-red-50 text-red-700" },
};

export default function CampagnesPage() {
  const router = useRouter();
  const [campagnes, setCampagnes] = useState<Campagne[]>([]);
  const [loading, setLoading] = useState(true);

  function dupliquer(c: Campagne) {
    sessionStorage.setItem(
      "pbnp_duplicate_campagne",
      JSON.stringify({ objet: c.objet, contenu: c.contenu }),
    );
    router.push("/admin/campagnes/nouvelle");
  }

  useEffect(() => {
    fetch("/api/admin/campagnes", { headers: adminAuthHeaders(), cache: "no-store" })
      .then((r) => r.json())
      .then((d) => setCampagnes(d.campagnes ?? []))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  return (
    <div>
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-display text-4xl font-black uppercase text-ink">
            Campagnes
          </h1>
          <p className="mt-1 text-smoke">
            Emails groupés aux adhérents et contacts du club.
          </p>
        </div>
        <div className="flex gap-3">
          <Link
            href="/admin/campagnes/templates"
            className="rounded-full border border-line bg-white px-5 py-2.5 text-sm font-semibold text-ink transition-colors hover:border-ink"
          >
            Templates
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
            Aucune campagne pour le moment.
          </div>
        ) : (
          <table className="w-full min-w-[40rem] text-left text-sm">
            <thead>
              <tr className="border-b border-line text-xs uppercase tracking-wide text-smoke">
                <th className="p-4 font-bold">Date</th>
                <th className="p-4 font-bold">Objet</th>
                <th className="p-4 font-bold">Destinataires</th>
                <th className="p-4 font-bold">Statut</th>
                <th className="p-4 text-right font-bold">Actions</th>
              </tr>
            </thead>
            <tbody>
              {campagnes.map((c) => {
                const b = STATUT_BADGE[c.statut] ?? STATUT_BADGE.brouillon;
                return (
                  <tr
                    key={c.id}
                    onClick={() => router.push(`/admin/campagnes/${c.id}`)}
                    className="cursor-pointer border-b border-line transition-colors last:border-0 hover:bg-paper-2"
                  >
                    <td className="whitespace-nowrap p-4 text-smoke">
                      {new Date(c.envoye_at ?? c.created_at).toLocaleDateString(
                        "fr-FR",
                      )}
                    </td>
                    <td className="p-4 font-semibold text-ink">{c.objet}</td>
                    <td className="p-4 text-smoke">{c.nb_destinataires ?? 0}</td>
                    <td className="p-4">
                      <span
                        className={`inline-flex whitespace-nowrap rounded-full px-2.5 py-1 text-xs font-bold ${b.cls}`}
                      >
                        {b.label}
                      </span>
                    </td>
                    <td className="p-4 text-right">
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          dupliquer(c);
                        }}
                        title="Dupliquer cette campagne"
                        aria-label="Dupliquer cette campagne"
                        className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-line text-ink transition-colors hover:border-orange hover:text-orange"
                      >
                        <svg
                          className="h-4 w-4"
                          viewBox="0 0 24 24"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="1.8"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        >
                          <rect x="9" y="9" width="13" height="13" rx="2" />
                          <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
                        </svg>
                      </button>
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
