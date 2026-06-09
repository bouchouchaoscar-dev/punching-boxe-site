"use client";

import { use, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { adminAuthHeaders } from "@/lib/admin-auth";
import type { Campagne } from "@/lib/campagnes";

const STATUT_BADGE: Record<string, { label: string; cls: string }> = {
  envoye: { label: "✅ Envoyé", cls: "bg-green-50 text-green-700" },
  brouillon: { label: "📝 Brouillon", cls: "bg-orange-50 text-orange-600" },
  erreur: { label: "❌ Erreur", cls: "bg-red-50 text-red-700" },
};

const TYPE_BADGE: Record<string, { label: string; cls: string }> = {
  campagne: { label: "Campagne", cls: "bg-orange-50 text-orange" },
  individuel: { label: "Individuel", cls: "bg-paper-2 text-ink/70" },
};

export default function CampagneDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const router = useRouter();
  const [campagne, setCampagne] = useState<Campagne | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    fetch(`/api/admin/campagnes/${id}`, {
      headers: adminAuthHeaders(),
      cache: "no-store",
    })
      .then((r) => r.json())
      .then((d) => {
        if (d.campagne) setCampagne(d.campagne);
        else setError(d.error || "Campagne introuvable.");
      })
      .catch(() => setError("Erreur de chargement."))
      .finally(() => setLoading(false));
  }, [id]);

  function dupliquer() {
    if (!campagne) return;
    sessionStorage.setItem(
      "pbnp_duplicate_campagne",
      JSON.stringify({ objet: campagne.objet, contenu: campagne.contenu }),
    );
    router.push("/admin/campagnes/nouvelle");
  }

  async function supprimer() {
    setDeleting(true);
    try {
      const res = await fetch(`/api/admin/campagnes/${id}`, {
        method: "DELETE",
        headers: adminAuthHeaders(),
      });
      if (res.ok) router.push("/admin/campagnes");
      else {
        const d = await res.json().catch(() => ({}));
        setError(d.error || "Suppression impossible.");
        setConfirmDelete(false);
      }
    } finally {
      setDeleting(false);
    }
  }

  if (loading) {
    return (
      <div className="flex h-60 items-center justify-center">
        <span className="h-7 w-7 animate-spin rounded-full border-2 border-ink/20 border-t-orange" />
      </div>
    );
  }
  if (error || !campagne) {
    return (
      <div className="rounded-xl bg-amber-50 p-6 text-amber-800">
        {error || "Campagne introuvable."}
        <div className="mt-4">
          <Link href="/admin/campagnes" className="font-bold text-orange">
            ← Retour aux campagnes
          </Link>
        </div>
      </div>
    );
  }

  const b = STATUT_BADGE[campagne.statut] ?? STATUT_BADGE.brouillon;
  const t = TYPE_BADGE[campagne.type ?? "campagne"] ?? TYPE_BADGE.campagne;
  const dateEnvoi = new Date(campagne.envoye_at ?? campagne.created_at);
  const destinataires = campagne.destinataires_liste ?? [];

  return (
    <div className="max-w-3xl">
      <Link
        href="/admin/campagnes"
        className="text-sm font-semibold text-smoke hover:text-ink"
      >
        ← Historique des envois
      </Link>

      <div className="mt-4 flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="font-display text-3xl font-black uppercase text-ink sm:text-4xl">
            {campagne.objet || "(sans objet)"}
          </h1>
          <p className="mt-2 text-sm text-smoke">
            {dateEnvoi.toLocaleDateString("fr-FR", {
              weekday: "long",
              day: "numeric",
              month: "long",
              year: "numeric",
            })}{" "}
            à{" "}
            {dateEnvoi.toLocaleTimeString("fr-FR", {
              hour: "2-digit",
              minute: "2-digit",
            })}
          </p>
          {campagne.cible && (
            <p className="mt-1 text-sm font-semibold text-ink">
              Cible : <span className="font-medium text-smoke">{campagne.cible}</span>
            </p>
          )}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <span
            className={`inline-flex whitespace-nowrap rounded-full px-3 py-1 text-xs font-bold ${t.cls}`}
          >
            {t.label}
          </span>
          <span
            className={`inline-flex whitespace-nowrap rounded-full px-3 py-1 text-xs font-bold ${b.cls}`}
          >
            {b.label}
          </span>
        </div>
      </div>

      {/* Actions */}
      <div className="mt-5 flex flex-wrap gap-3">
        <button
          onClick={dupliquer}
          className="rounded-full bg-orange px-5 py-2.5 text-sm font-bold text-white transition-colors hover:bg-orange/90"
        >
          Dupliquer cette campagne
        </button>
        <button
          onClick={() => setConfirmDelete(true)}
          className="rounded-full border border-line bg-white px-5 py-2.5 text-sm font-semibold text-red-600 transition-colors hover:border-red-300 hover:bg-red-50"
        >
          Supprimer
        </button>
      </div>

      {/* Message */}
      <div className="mt-8 rounded-[1.5rem] border border-line bg-white p-6">
        <h2 className="font-display text-lg font-extrabold uppercase text-ink">
          Message
        </h2>
        <p className="mt-3 text-sm font-bold text-ink">{campagne.objet}</p>
        <div className="mt-2 whitespace-pre-wrap rounded-xl border border-line bg-paper-2 p-4 text-sm text-ink">
          {campagne.contenu}
        </div>
      </div>

      {/* Destinataires */}
      <div className="mt-6 rounded-[1.5rem] border border-line bg-white p-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="font-display text-lg font-extrabold uppercase text-ink">
            Destinataires
          </h2>
          <span className="text-sm font-semibold text-smoke">
            {campagne.nb_destinataires ?? destinataires.length} au total
            {campagne.nb_envoyes != null && (
              <> · {campagne.nb_envoyes} envoyé{campagne.nb_envoyes > 1 ? "s" : ""}</>
            )}
            {campagne.nb_exclus != null && campagne.nb_exclus > 0 && (
              <> · {campagne.nb_exclus} exclu{campagne.nb_exclus > 1 ? "s" : ""}</>
            )}
          </span>
        </div>

        {destinataires.length > 0 ? (
          <ul className="mt-4 divide-y divide-line">
            {destinataires.map((d, i) => {
              const nomComplet = `${d.prenom ?? ""} ${d.nom ?? ""}`.trim();
              return (
                <li
                  key={`${d.email}-${i}`}
                  className="flex flex-wrap items-center justify-between gap-2 py-2.5 text-sm"
                >
                  <span className="font-semibold text-ink">
                    {nomComplet || "—"}
                  </span>
                  <span className="text-smoke">{d.email}</span>
                </li>
              );
            })}
          </ul>
        ) : (
          <p className="mt-4 text-sm text-smoke">
            La liste détaillée des destinataires n&apos;est pas disponible pour
            cette campagne (envoyée avant l&apos;ajout de cette fonctionnalité).
          </p>
        )}
      </div>

      {/* Modal suppression */}
      {confirmDelete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink/40 p-4">
          <div className="w-full max-w-md rounded-[1.5rem] bg-white p-6 text-center">
            <h2 className="font-display text-xl font-extrabold uppercase text-ink">
              Supprimer cette campagne ?
            </h2>
            <p className="mt-3 text-sm text-smoke">
              Supprimer cette campagne de l&apos;historique ? Cette action est
              irréversible.
            </p>
            <div className="mt-5 flex justify-center gap-3">
              <button
                onClick={() => setConfirmDelete(false)}
                disabled={deleting}
                className="rounded-full border border-line px-5 py-2.5 text-sm font-semibold text-ink"
              >
                Annuler
              </button>
              <button
                onClick={supprimer}
                disabled={deleting}
                className="rounded-full bg-red-600 px-5 py-2.5 text-sm font-bold text-white transition-colors hover:bg-red-700 disabled:opacity-50"
              >
                {deleting ? "Suppression…" : "Confirmer la suppression"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
