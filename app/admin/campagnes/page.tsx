"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Clock, FileText } from "lucide-react";
import { adminAuthHeaders } from "@/lib/admin-auth";
import { textesSuppressionHistorique, type Campagne } from "@/lib/campagnes";
import { PageHeader } from "@/components/admin/PageHeader";
import { OverflowMenu } from "@/components/ui/OverflowMenu";
import { SelectMenu } from "@/components/ui/SelectMenu";

const STATUT_BADGE: Record<string, { label: string; cls: string }> = {
  envoye: { label: "✅ Envoyé", cls: "bg-green-50 text-green-700" },
  partiel: { label: "⚠️ Partiel", cls: "bg-amber-50 text-amber-700" },
  brouillon: { label: "📝 Brouillon", cls: "bg-orange-50 text-orange-600" },
  erreur: { label: "❌ Erreur", cls: "bg-red-50 text-red-700" },
  planifiee: { label: "🕓 Planifiée", cls: "bg-blue-50 text-blue-700" },
  en_cours: { label: "⏳ Envoi en cours", cls: "bg-blue-50 text-blue-700" },
};

const TYPE_BADGE: Record<string, { label: string; cls: string }> = {
  campagne: { label: "Campagne", cls: "bg-orange-50 text-orange" },
  individuel: { label: "Individuel", cls: "bg-paper-2 text-ink/70" },
  planning_cours: { label: "Planning : prévenir", cls: "bg-blue-50 text-blue-700" },
  planning_profs: { label: "Planning profs", cls: "bg-indigo-50 text-indigo-700" },
};

// Filtres par type (barre au-dessus de l'historique).
const FILTRES_TYPE: { key: string; label: string }[] = [
  { key: "tous", label: "Tous" },
  { key: "campagne", label: "Campagnes" },
  { key: "planning_cours", label: "Planning : prévenir" },
  { key: "planning_profs", label: "Planning profs" },
  { key: "individuel", label: "Individuels" },
];

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
  const [filtre, setFiltre] = useState("tous");
  const [aSupprimer, setASupprimer] = useState<Campagne | null>(null);

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
  async function executerSuppression() {
    const c = aSupprimer;
    if (!c) return;
    setBusy(c.id);
    try {
      await fetch(`/api/admin/campagnes/${c.id}`, {
        method: "DELETE",
        headers: adminAuthHeaders(),
      });
      setASupprimer(null);
      load();
    } finally {
      setBusy(null);
    }
  }

  const filtered = campagnes.filter((c) => filtre === "tous" || (c.type ?? "campagne") === filtre);

  return (
    <div>
      <PageHeader
        title="Mailing"
        description={
          <>
            Campagnes, mails individuels et envois planifiés, du plus récent au plus ancien.
            <span className="mt-2 block">
              Envoyez une campagne en quelques clics grâce aux listes intelligentes, écrivez
              librement ou partez d&apos;un modèle, planifiez pour plus tard. Tout
              l&apos;historique des envois est conservé ici.
            </span>
          </>
        }
        actions={
          <>
            {/* Desktop : boutons secondaires + action principale (inchangés). */}
            <Link
              href="/admin/campagnes/templates"
              className="hidden rounded-full border border-line bg-white px-5 py-2.5 text-sm font-semibold text-ink transition-colors hover:border-ink md:inline-flex"
            >
              Modèles
            </Link>
            <Link
              href="/admin/campagnes/nouvelle?planifier=1"
              className="hidden rounded-full border border-line bg-white px-5 py-2.5 text-sm font-semibold text-ink transition-colors hover:border-orange hover:text-orange md:inline-flex"
            >
              🕓 Planifier une campagne
            </Link>
            <Link
              href="/admin/campagnes/nouvelle"
              className="hidden whitespace-nowrap rounded-full bg-orange px-5 py-2.5 text-sm font-bold text-white transition-colors hover:bg-orange/90 md:inline-flex"
            >
              + Nouvelle campagne
            </Link>
            {/* Mobile : sélecteur de type compact à droite du titre. */}
            {campagnes.length > 0 && (
              <div className="md:hidden">
                <SelectMenu
                  value={filtre}
                  onChange={setFiltre}
                  label="Type"
                  compact
                  align="right"
                  variant={filtre === "tous" ? "neutre" : "accent"}
                  options={FILTRES_TYPE.map((f) => ({ value: f.key, label: f.label }))}
                />
              </div>
            )}
          </>
        }
      />

      {/* Mobile : ligne 2 — « + Nouvelle campagne » pleine largeur + « ⋯ » (même hauteur). */}
      <div className="mt-3 flex items-stretch gap-2 md:hidden">
        <Link
          href="/admin/campagnes/nouvelle"
          className="flex h-11 flex-1 items-center justify-center whitespace-nowrap rounded-full bg-orange text-sm font-bold text-white transition-colors hover:bg-orange/90"
        >
          + Nouvelle campagne
        </Link>
        <OverflowMenu
          actions={[
            { label: "Modèles", icon: <FileText className="h-4 w-4" />, onClick: () => router.push("/admin/campagnes/templates") },
            { label: "Planifier une campagne", icon: <Clock className="h-4 w-4" />, onClick: () => router.push("/admin/campagnes/nouvelle?planifier=1") },
          ]}
        />
      </div>

      {!loading && campagnes.length > 0 && (
        // Desktop : sélecteur de type au-dessus du tableau (le mobile l'a dans l'en-tête).
        <div className="mt-6 hidden md:block">
          <SelectMenu
            value={filtre}
            onChange={setFiltre}
            label="Type"
            variant={filtre === "tous" ? "neutre" : "accent"}
            options={FILTRES_TYPE.map((f) => ({ value: f.key, label: f.label }))}
          />
        </div>
      )}

      <div className="mt-4">
        {loading ? (
          // Skeleton calqué sur le tableau (mêmes colonnes) → pas de layout
          // shift, attente perçue courte. Le reste de la page est déjà affiché.
          <div className="overflow-x-auto rounded-[1.5rem] border border-line bg-white">
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
              {Array.from({ length: 6 }).map((_, i) => (
                <tr key={i} className="border-b border-line">
                  {["w-20", "w-16", "w-48", "w-10", "w-24", "w-6"].map((w, j) => (
                    <td key={j} className="p-4">
                      <div className={`h-3 ${w} max-w-full animate-pulse rounded bg-line`} />
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
          </div>
        ) : filtered.length === 0 ? (
          <div className="rounded-[1.5rem] border border-line bg-white p-12 text-center text-smoke">
            Aucun envoi pour le moment.
          </div>
        ) : (
          <>
            {/* Desktop (lg+) : tableau historique inchangé. */}
            <div className="hidden overflow-x-auto rounded-[1.5rem] border border-line bg-white lg:block">
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
              {filtered.map((c) => {
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
                      <div
                        className="flex items-center justify-end gap-3"
                        onClick={(e) => e.stopPropagation()}
                      >
                        {c.statut === "planifiee" && (
                          <button
                            onClick={() => togglePause(c)}
                            disabled={busy === c.id}
                            className="text-xs font-semibold text-ink transition-colors hover:text-orange hover:underline disabled:opacity-50"
                          >
                            {c.etat === "pause" ? "Reprendre" : "Pause"}
                          </button>
                        )}
                        <button
                          onClick={() => setASupprimer(c)}
                          disabled={busy === c.id || c.statut === "en_cours"}
                          title={c.statut === "en_cours" ? "Envoi en cours, suppression impossible" : ""}
                          className="text-xs font-semibold text-red-600 transition-colors hover:underline disabled:cursor-not-allowed disabled:text-smoke/50 disabled:no-underline"
                        >
                          {textesSuppressionHistorique(c.statut).lienListe}
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
            </div>

            {/* Mobile (< lg) : cartes empilées, mêmes données/badges que le
                tableau, lisibles sans scroll horizontal. */}
            <ul className="space-y-3 lg:hidden">
              {filtered.map((c) => {
                const planifiee =
                  c.statut === "planifiee" || c.statut === "en_cours";
                const b = STATUT_BADGE[c.statut] ?? STATUT_BADGE.brouillon;
                const t = TYPE_BADGE[c.type ?? "campagne"] ?? TYPE_BADGE.campagne;
                const individuel = c.type === "individuel";
                return (
                  <li key={c.id}>
                    <div
                      onClick={() => router.push(`/admin/campagnes/${c.id}`)}
                      className="cursor-pointer rounded-2xl border border-line bg-white p-4 transition-all hover:border-orange/40 hover:shadow-md active:scale-[0.99]"
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="text-xs text-smoke">
                          {planifiee && c.scheduled_at ? (
                            <>
                              <span className="block uppercase tracking-wide text-blue-600">
                                Prévu
                              </span>
                              {dateHeure(c.scheduled_at)}
                            </>
                          ) : (
                            dateHeure(c.envoye_at ?? c.created_at)
                          )}
                        </div>
                        <span
                          className={`inline-flex shrink-0 whitespace-nowrap rounded-full px-2.5 py-1 text-xs font-bold ${t.cls}`}
                        >
                          {t.label}
                        </span>
                      </div>

                      <p className="mt-2 font-semibold text-ink [overflow-wrap:anywhere]">
                        {c.objet}
                      </p>
                      {c.cible && (
                        <p className="mt-0.5 text-xs text-smoke">{c.cible}</p>
                      )}

                      <div className="mt-3 flex flex-wrap items-center gap-2">
                        <span
                          className={`inline-flex whitespace-nowrap rounded-full px-2.5 py-1 text-xs font-bold ${b.cls}`}
                        >
                          {b.label}
                        </span>
                        {planifiee && c.etat === "pause" && (
                          <span className="text-xs font-semibold text-amber-600">
                            ⏸ en pause
                          </span>
                        )}
                        <span className="text-xs text-smoke">
                          {planifiee
                            ? "—"
                            : individuel
                              ? "1 destinataire"
                              : `${c.nb_destinataires ?? 0} destinataire${
                                  (c.nb_destinataires ?? 0) > 1 ? "s" : ""
                                }`}
                          {!planifiee &&
                            !individuel &&
                            c.nb_envoyes != null &&
                            ` · ${c.nb_envoyes} email${
                              c.nb_envoyes > 1 ? "s" : ""
                            }`}
                        </span>
                      </div>

                      <div
                        className="mt-3 flex gap-4"
                        onClick={(e) => e.stopPropagation()}
                      >
                        {c.statut === "planifiee" && (
                          <button
                            onClick={() => togglePause(c)}
                            disabled={busy === c.id}
                            className="text-xs font-semibold text-ink transition-colors hover:text-orange hover:underline disabled:opacity-50"
                          >
                            {c.etat === "pause" ? "Reprendre" : "Pause"}
                          </button>
                        )}
                        <button
                          onClick={() => setASupprimer(c)}
                          disabled={busy === c.id || c.statut === "en_cours"}
                          title={c.statut === "en_cours" ? "Envoi en cours, suppression impossible" : ""}
                          className="text-xs font-semibold text-red-600 transition-colors hover:underline disabled:cursor-not-allowed disabled:text-smoke/50 disabled:no-underline"
                        >
                          {textesSuppressionHistorique(c.statut).lienListe}
                        </button>
                      </div>
                    </div>
                  </li>
                );
              })}
            </ul>
          </>
        )}
      </div>

      {/* Confirmation de suppression (masquage de l'historique, pas de rappel des mails) */}
      {aSupprimer && (() => {
        const txt = textesSuppressionHistorique(aSupprimer.statut);
        const nb = aSupprimer.nb_destinataires ?? 0;
        return (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink/40 p-4">
            <div className="w-full max-w-md rounded-[1.5rem] bg-white p-6">
              <h2 className="font-display text-lg font-extrabold uppercase text-ink">{txt.titre}</h2>
              <div className="mt-3 rounded-xl border border-line bg-paper-2 p-3 text-sm">
                <p className="font-semibold text-ink">{aSupprimer.objet}</p>
                <p className="mt-0.5 text-xs text-smoke">
                  {txt.annulation && aSupprimer.scheduled_at
                    ? `Prévue le ${dateHeure(aSupprimer.scheduled_at)}`
                    : dateHeure(aSupprimer.envoye_at ?? aSupprimer.created_at)}
                  {nb > 0 ? ` · ${nb} destinataire${nb > 1 ? "s" : ""}` : ""}
                </p>
              </div>
              <p className="mt-3 text-sm text-smoke">
                {txt.annulation
                  ? "Elle ne partira pas."
                  : "Les mails déjà envoyés ne sont pas rappelés, seule la trace disparaît de l'historique."}
              </p>
              <div className="mt-5 flex justify-end gap-3">
                <button
                  onClick={() => setASupprimer(null)}
                  disabled={busy === aSupprimer.id}
                  className="rounded-full border border-line px-5 py-2.5 text-sm font-semibold text-ink"
                >
                  Retour
                </button>
                <button
                  onClick={executerSuppression}
                  disabled={busy === aSupprimer.id}
                  className="rounded-full bg-red-600 px-5 py-2.5 text-sm font-bold text-white hover:bg-red-700 disabled:opacity-50"
                >
                  {busy === aSupprimer.id ? "…" : txt.boutonConfirmer}
                </button>
              </div>
            </div>
          </div>
        );
      })()}
    </div>
  );
}
