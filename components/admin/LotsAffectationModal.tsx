"use client";

import { useCallback, useEffect, useState } from "react";
import { adminAuthHeaders } from "@/lib/admin-auth";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { jourLong } from "@/lib/planning";

type CoursLite = { id: string; libelle: string | null; jour_semaine?: number | null };
type ProfLite = { id: string; nom: string | null; prenom: string | null };
type CoursAgg = { coursId: string; nb: number; nbFutures: number };
type Lot = {
  lot: string; nb: number; nbFutures: number;
  coursIds: string[]; profIds: string[];
  premiereSemaine: string; derniereSemaine: string;
  parCours: CoursAgg[];
};

const frSem = (iso: string) => { const [y, m, d] = iso.split("-"); return `${d}/${m}/${y}`; };

// [023/024] Gestion des lots « affecter sur une période » : contenu détaillé
// (prof, cours, période, nb séances) + suppression ciblée — lot entier, certains
// cours du lot, ou seulement les séances à venir. ConfirmDialog + récap chiffré.
export function LotsAffectationModal({ cours, profs, onClose, onDone }: {
  cours: CoursLite[];
  profs: ProfLite[];
  onClose: () => void;
  onDone: (msg: string) => void;
}) {
  const [lots, setLots] = useState<Lot[] | null>(null);
  const [erreur, setErreur] = useState("");
  const [ouvert, setOuvert] = useState<Set<string>>(new Set());
  const [coursSel, setCoursSel] = useState<Record<string, Set<string>>>({}); // par lot
  const [futures, setFutures] = useState<Record<string, boolean>>({}); // par lot
  const [confirm, setConfirm] = useState<{ lot: Lot; coursIds: string[]; futuresSeulement: boolean; count: number; libelle: string } | null>(null);
  const [busy, setBusy] = useState(false);

  const coursNom = (id: string) => cours.find((c) => c.id === id)?.libelle ?? "Cours";
  const coursJour = (id: string) => { const j = cours.find((c) => c.id === id)?.jour_semaine; return j ? jourLong(j) : ""; };
  const profNom = (id: string) => { const p = profs.find((x) => x.id === id); return p ? `${p.prenom ?? ""} ${p.nom ?? ""}`.trim() : "Prof"; };

  const charger = useCallback(() => {
    fetch("/api/admin/planning/lots", { headers: adminAuthHeaders(), cache: "no-store" })
      .then(async (r) => { const d = await r.json(); if (!r.ok) throw new Error(d?.error || "Erreur."); setLots(d.lots ?? []); setErreur(""); })
      .catch((e) => { setLots([]); setErreur(e instanceof Error ? e.message : "Erreur de chargement."); });
  }, []);
  useEffect(() => { charger(); }, [charger]);

  const toggleOuvert = (lot: string) => setOuvert((s) => { const n = new Set(s); n.has(lot) ? n.delete(lot) : n.add(lot); return n; });
  const toggleCours = (lot: string, coursId: string) =>
    setCoursSel((m) => { const cur = new Set(m[lot] ?? []); cur.has(coursId) ? cur.delete(coursId) : cur.add(coursId); return { ...m, [lot]: cur }; });

  // Nombre de séances qui seraient supprimées (sélection de cours + à venir ?).
  function compter(lot: Lot, coursIds: string[], futuresSeulement: boolean): number {
    const champs = coursIds.length ? lot.parCours.filter((c) => coursIds.includes(c.coursId)) : lot.parCours;
    return champs.reduce((s, c) => s + (futuresSeulement ? c.nbFutures : c.nb), 0);
  }

  function demander(lot: Lot, mode: "selection" | "tout") {
    const fut = !!futures[lot.lot];
    const sel = mode === "selection" ? [...(coursSel[lot.lot] ?? [])] : [];
    const count = compter(lot, sel, fut);
    const quoi = sel.length
      ? `${sel.length} cours du lot`
      : "tout le lot";
    const quand = fut ? " (séances à venir uniquement)" : "";
    setConfirm({ lot: lot, coursIds: sel, futuresSeulement: fut, count, libelle: `${quoi}${quand}` });
  }

  async function supprimer() {
    if (!confirm) return;
    setBusy(true);
    try {
      const r = await fetch("/api/admin/planning/affecter-periode", {
        method: "DELETE", headers: { "Content-Type": "application/json", ...adminAuthHeaders() },
        body: JSON.stringify({ lotId: confirm.lot.lot, coursIds: confirm.coursIds, futuresSeulement: confirm.futuresSeulement }),
      });
      const d = await r.json().catch(() => ({}));
      setConfirm(null);
      if (r.ok) {
        onDone(`${d.supprimees ?? 0} affectation${(d.supprimees ?? 0) > 1 ? "s" : ""} supprimée${(d.supprimees ?? 0) > 1 ? "s" : ""}`);
        setCoursSel({});
        charger();
      } else {
        setErreur(d.error || "Échec de la suppression.");
      }
    } finally { setBusy(false); }
  }

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-ink/40 p-4" onClick={onClose}>
      <div className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-[1.5rem] bg-white p-6" onClick={(e) => e.stopPropagation()}>
        <h2 className="font-display text-xl font-extrabold uppercase text-ink">Lots d&apos;affectation</h2>
        <p className="mt-1 text-sm text-smoke">Affectations créées « sur une période ». Supprimables en bloc, par cours, ou seulement à venir.</p>

        {erreur && <p className="mt-3 rounded-xl bg-red-50 p-2.5 text-sm font-semibold text-red-700">{erreur}</p>}

        {lots === null ? (
          <p className="mt-4 text-sm text-smoke">Chargement…</p>
        ) : lots.length === 0 ? (
          <p className="mt-4 rounded-xl border border-line bg-paper-2 p-4 text-center text-sm text-smoke">Aucun lot pour le moment.</p>
        ) : (
          <ul className="mt-4 space-y-2">
            {lots.map((l) => {
              const sel = coursSel[l.lot] ?? new Set<string>();
              const fut = !!futures[l.lot];
              return (
                <li key={l.lot} className="rounded-xl border border-line p-3">
                  <button onClick={() => toggleOuvert(l.lot)} className="flex w-full items-start gap-2 text-left">
                    <span className={`mt-0.5 shrink-0 text-smoke transition-transform ${ouvert.has(l.lot) ? "rotate-90" : ""}`}>›</span>
                    <span className="min-w-0 flex-1">
                      <span className="block text-sm font-semibold text-ink">{l.profIds.map(profNom).join(", ")}</span>
                      <span className="block text-xs text-smoke">
                        {frSem(l.premiereSemaine)} → {frSem(l.derniereSemaine)} · {l.nb} séance{l.nb > 1 ? "s" : ""}
                        {l.nbFutures > 0 ? ` (dont ${l.nbFutures} à venir)` : " (toutes passées)"}
                      </span>
                      <span className="mt-0.5 block truncate text-xs text-smoke">{l.coursIds.map(coursNom).join(", ")}</span>
                    </span>
                  </button>

                  {ouvert.has(l.lot) && (
                    <div className="mt-3 border-t border-line pt-3">
                      <p className="mb-1.5 text-xs font-bold uppercase tracking-wide text-smoke">Cours du lot (cocher pour cibler la suppression)</p>
                      <div className="space-y-1">
                        {l.parCours.map((c) => (
                          <label key={c.coursId} className="flex cursor-pointer items-center gap-2 rounded-lg border border-line px-2.5 py-1.5 text-sm">
                            <input type="checkbox" checked={sel.has(c.coursId)} onChange={() => toggleCours(l.lot, c.coursId)} className="h-4 w-4 accent-orange" />
                            <span className="min-w-0 flex-1 truncate text-ink">{coursNom(c.coursId)}{coursJour(c.coursId) ? <span className="text-smoke"> · {coursJour(c.coursId)}</span> : null}</span>
                            <span className="shrink-0 text-xs text-smoke">{c.nb} séance{c.nb > 1 ? "s" : ""}{c.nbFutures > 0 ? ` · ${c.nbFutures} à venir` : ""}</span>
                          </label>
                        ))}
                      </div>

                      <label className="mt-2 flex cursor-pointer items-center gap-2 text-sm text-ink">
                        <input type="checkbox" checked={fut} onChange={() => setFutures((m) => ({ ...m, [l.lot]: !m[l.lot] }))} className="h-4 w-4 accent-orange" />
                        Séances à venir uniquement (conserver l&apos;historique passé)
                      </label>

                      <div className="mt-3 flex flex-wrap gap-2">
                        <button
                          onClick={() => demander(l, "selection")}
                          disabled={sel.size === 0}
                          title={sel.size === 0 ? "Cochez au moins un cours" : ""}
                          className="rounded-full border border-red-200 bg-red-50 px-3 py-1.5 text-xs font-semibold text-red-700 hover:bg-red-100 disabled:cursor-not-allowed disabled:opacity-40"
                        >
                          Supprimer les cours cochés
                        </button>
                        <button
                          onClick={() => demander(l, "tout")}
                          className="rounded-full border border-red-200 bg-white px-3 py-1.5 text-xs font-semibold text-red-700 hover:border-red-400"
                        >
                          {fut ? "Supprimer les séances à venir du lot" : "Supprimer tout le lot"}
                        </button>
                      </div>
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        )}

        <div className="mt-5 flex justify-end">
          <button onClick={onClose} className="rounded-full border border-line px-5 py-2.5 text-sm font-semibold text-ink">Fermer</button>
        </div>
      </div>

      {confirm && (
        <ConfirmDialog
          title="Supprimer des affectations"
          message={
            <div className="space-y-1 text-left text-sm">
              <p>
                Supprimer <strong>{confirm.count}</strong> affectation{confirm.count > 1 ? "s" : ""} — <strong>{confirm.libelle}</strong>
                {" "}pour <strong className="text-ink">{confirm.lot.profIds.map(profNom).join(", ")}</strong> ?
              </p>
              {confirm.count === 0 && <p className="text-smoke">Rien à supprimer avec ces critères.</p>}
            </div>
          }
          variant="danger"
          confirmLabel={busy ? "Suppression…" : "Supprimer"}
          busy={busy}
          onConfirm={supprimer}
          onCancel={() => !busy && setConfirm(null)}
        />
      )}
    </div>
  );
}
