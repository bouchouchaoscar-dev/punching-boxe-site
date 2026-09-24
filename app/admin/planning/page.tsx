"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { adminAuthHeaders, getAdminRole } from "@/lib/admin-auth";
import { CLUB } from "@/lib/constants";
import { DatePicker } from "@/components/ui/DatePicker";
import { PlanningSemaine } from "@/components/admin/PlanningSemaine";
import {
  planningActif,
  lundiDeLaSemaine,
  toISODate,
  dateDuJour,
  jourLong,
  formatHeure,
  heureFr,
  plageHoraire,
  formatDateCours,
  formatLieu,
  lieuAvecPreposition,
  genererMailPrevenir,
  prochaineOccurrence,
  disciplineLabel,
  publicLabel,
  couleurCours,
  formatDureeHeures,
  MSG_HISTORIQUE_COURS,
  DISCIPLINES_COURS,
  JOURS,
  type StatProf,
  type Prof,
  type ProfMinimal,
  type Cours,
  type Affectation,
  type PeriodeFermeture,
} from "@/lib/planning";

type Tab = "calendrier" | "profs" | "cours" | "fermetures";

const jsonHeaders = () => ({ "Content-Type": "application/json", ...adminAuthHeaders() });

export default function PlanningPage() {
  const actif = planningActif();
  const [role, setRole] = useState<string | null>(null);
  useEffect(() => setRole(getAdminRole()), []);
  const [tab, setTab] = useState<Tab>("calendrier");
  const [profs, setProfs] = useState<Prof[]>([]);
  const [cours, setCours] = useState<Cours[]>([]);
  const [periodes, setPeriodes] = useState<PeriodeFermeture[]>([]);
  const [semaineISO, setSemaineISO] = useState(() => toISODate(lundiDeLaSemaine(new Date())));
  const [affectations, setAffectations] = useState<Affectation[]>([]);
  const [toast, setToast] = useState<string | null>(null);

  // Cours pour lequel on prévient les adhérents (mailing ciblé par discipline).
  const [prevenir, setPrevenir] = useState<Cours | null>(null);
  // Mode sélection multiple (cases à cocher) + cours sélectionnés (semaine courante).
  const [selectionMode, setSelectionMode] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  // Choix d'un prof : soit pour un cours précis (coursId), soit en masse (action).
  const [profPicker, setProfPicker] = useState<
    { kind: "single"; coursId: string } | { kind: "bulk"; action: "add" | "remove" } | null
  >(null);
  // Aperçu d'envoi de planning (badge + bouton) et modales récap.
  const [envoiPreview, setEnvoiPreview] = useState<{ aEnvoyer: number; profs: { prof_id: string; nom: string; sansEmail: boolean; statut: string; nbCours: number }[] } | null>(null);
  const [envoiModal, setEnvoiModal] = useState(false);
  const [reprise, setReprise] = useState<{ source: string; sourceFermee: boolean; reprises: number; ignorees: number } | null>(null);
  const [busyAction, setBusyAction] = useState(false);

  const flash = useCallback((m: string) => {
    setToast(m);
    window.setTimeout(() => setToast(null), 3200);
  }, []);

  const chargerBase = useCallback(() => {
    if (!actif || role === "coach") return; // le coach a sa propre vue lecture seule
    fetch("/api/admin/planning/profs", { headers: adminAuthHeaders(), cache: "no-store" })
      .then((r) => r.json())
      .then((d) => setProfs(d.profs ?? []))
      .catch(() => {});
    fetch("/api/admin/planning/cours", { headers: adminAuthHeaders(), cache: "no-store" })
      .then((r) => r.json())
      .then((d) => setCours(d.cours ?? []))
      .catch(() => {});
    fetch("/api/admin/planning/fermetures", { headers: adminAuthHeaders(), cache: "no-store" })
      .then((r) => r.json())
      .then((d) => setPeriodes(d.periodes ?? []))
      .catch(() => {});
  }, [actif, role]);

  const chargerAffectations = useCallback(() => {
    if (!actif || role === "coach") return;
    fetch(`/api/admin/planning/affectations?semaine=${semaineISO}`, {
      headers: adminAuthHeaders(),
      cache: "no-store",
    })
      .then((r) => r.json())
      .then((d) => setAffectations(d.affectations ?? []))
      .catch(() => {});
    // Aperçu d'envoi (badge « modifications non envoyées » + bouton).
    fetch(`/api/admin/planning/envoi?semaine=${semaineISO}`, { headers: adminAuthHeaders(), cache: "no-store" })
      .then((r) => r.json())
      .then((d) => setEnvoiPreview({ aEnvoyer: d.aEnvoyer ?? 0, profs: d.profs ?? [] }))
      .catch(() => setEnvoiPreview(null));
  }, [actif, semaineISO, role]);

  useEffect(() => chargerBase(), [chargerBase]);
  useEffect(() => chargerAffectations(), [chargerAffectations]);
  // Changer de semaine vide la sélection (elle est propre à la semaine affichée).
  useEffect(() => {
    setSelected(new Set());
    setSelectionMode(false);
  }, [semaineISO]);

  const profsActifs = useMemo(() => profs.filter((p) => p.actif), [profs]);
  const coursActifs = useMemo(() => cours.filter((c) => c.actif), [cours]);

  function decalerSemaine(deltaJours: number) {
    const [y, m, d] = semaineISO.split("-").map(Number);
    const base = new Date(y, m - 1, d);
    base.setDate(base.getDate() + deltaJours);
    setSemaineISO(toISODate(lundiDeLaSemaine(base)));
  }

  // ---- Affectations (SILENCIEUX : aucun mail — l'envoi passe par « Envoyer le planning ») ----
  async function ajouterProf(coursId: string, profId: string) {
    const res = await fetch("/api/admin/planning/affectations", {
      method: "POST",
      headers: jsonHeaders(),
      body: JSON.stringify({ cours_id: coursId, prof_id: profId, semaine: semaineISO }),
    });
    const d = await res.json();
    if (!res.ok) flash(d.error || "Échec de l'affectation.");
    else chargerAffectations();
  }
  async function retirerProf(coursId: string, profId: string) {
    const res = await fetch("/api/admin/planning/affectations", {
      method: "DELETE",
      headers: jsonHeaders(),
      body: JSON.stringify({ cours_id: coursId, prof_id: profId, semaine: semaineISO }),
    });
    if (res.ok) chargerAffectations();
    else flash("Échec du retrait.");
  }

  function toggleSelect(coursId: string) {
    setSelected((s) => {
      const n = new Set(s);
      if (n.has(coursId)) n.delete(coursId);
      else n.add(coursId);
      return n;
    });
  }

  // Profs déjà affectés à un cours (pour ne pas les reproposer au « + prof »).
  const profIdsParCours = useMemo(() => {
    const m = new Map<string, Set<string>>();
    for (const a of affectations) {
      if (!a.prof_id) continue;
      const set = m.get(a.cours_id) ?? new Set<string>();
      set.add(a.prof_id);
      m.set(a.cours_id, set);
    }
    return m;
  }, [affectations]);

  // Application d'un choix de prof (single ou masse).
  async function appliquerProf(profId: string) {
    if (!profPicker) return;
    setBusyAction(true);
    try {
      if (profPicker.kind === "single") {
        await ajouterProf(profPicker.coursId, profId);
      } else {
        const res = await fetch("/api/admin/planning/affectations/bulk", {
          method: "POST",
          headers: jsonHeaders(),
          body: JSON.stringify({ semaine: semaineISO, prof_id: profId, cours_ids: [...selected], action: profPicker.action }),
        });
        const d = await res.json();
        if (!res.ok) flash(d.error || "Échec de l'opération.");
        else {
          flash(profPicker.action === "add" ? "Prof affecté à la sélection ✓" : "Prof retiré de la sélection ✓");
          chargerAffectations();
        }
      }
    } finally {
      setBusyAction(false);
      setProfPicker(null);
    }
  }

  // Reprise des profs de la semaine passée : aperçu puis application.
  async function ouvrirReprise() {
    const res = await fetch(`/api/admin/planning/reprendre?semaine=${semaineISO}`, { headers: adminAuthHeaders(), cache: "no-store" });
    const d = await res.json();
    if (!res.ok) return flash(d.error || "Impossible de calculer la reprise.");
    setReprise({ source: d.source, sourceFermee: d.sourceFermee, reprises: d.reprises, ignorees: d.ignorees });
  }
  async function confirmerReprise() {
    setBusyAction(true);
    try {
      const res = await fetch("/api/admin/planning/reprendre", { method: "POST", headers: jsonHeaders(), body: JSON.stringify({ semaine: semaineISO }) });
      const d = await res.json();
      if (!res.ok) flash(d.error || "Échec de la reprise.");
      else {
        flash(`${d.reprises} affectation${d.reprises > 1 ? "s" : ""} reprise${d.reprises > 1 ? "s" : ""}`);
        chargerAffectations();
      }
    } finally {
      setBusyAction(false);
      setReprise(null);
    }
  }

  // Envoi groupé du planning.
  async function confirmerEnvoi() {
    setBusyAction(true);
    try {
      const res = await fetch("/api/admin/planning/envoi", { method: "POST", headers: jsonHeaders(), body: JSON.stringify({ semaine: semaineISO }) });
      const d = await res.json();
      if (!res.ok) flash(d.error || "Échec de l'envoi.");
      else flash(`${d.envoyes} mail${d.envoyes > 1 ? "s" : ""} envoyé${d.envoyes > 1 ? "s" : ""}${d.sansEmail ? ` · ${d.sansEmail} sans email` : ""}`);
      chargerAffectations();
    } finally {
      setBusyAction(false);
      setEnvoiModal(false);
    }
  }

  // Profs présents sur la sélection (pour « Retirer un prof » en masse).
  const profsSurSelection = useMemo(() => {
    const ids = new Set<string>();
    for (const a of affectations) if (a.prof_id && selected.has(a.cours_id)) ids.add(a.prof_id);
    return profs.filter((p) => ids.has(p.id));
  }, [affectations, selected, profs]);

  if (!actif) {
    return (
      <div className="max-w-2xl">
        <h1 className="font-display text-4xl font-black uppercase text-ink">Planning</h1>
        <p className="mt-4 rounded-xl border border-line bg-paper-2 p-4 text-sm text-smoke">
          Le module Planning est désactivé pour ce club.
        </p>
      </div>
    );
  }

  // Coach : vue LECTURE SEULE (données via /api/coach/planning, aucune action).
  if (role === "coach") return <PlanningCoach />;

  const TABS: { key: Tab; label: string }[] = [
    { key: "calendrier", label: "Calendrier" },
    { key: "cours", label: "Cours" },
    { key: "profs", label: "Profs" },
    { key: "fermetures", label: "Fermetures" },
  ];

  return (
    <div className="max-w-5xl">
      <h1 className="font-display text-4xl font-black uppercase text-ink">Planning</h1>
      <p className="mt-2 text-sm text-smoke">
        Grille hebdomadaire des cours, affectation des profs et périodes de fermeture.
      </p>

      {/* Onglets */}
      <div className="mt-6 flex flex-wrap gap-2">
        {TABS.map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`rounded-full px-4 py-2 text-sm font-semibold transition-colors ${
              tab === t.key
                ? "bg-ink text-white"
                : "border border-line bg-white text-ink/70 hover:border-orange"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      <div className="mt-6 rounded-[1.5rem] border border-line bg-white p-4 sm:p-6">
        {tab === "calendrier" && (
          <>
            {/* Barre d'outils : mobile = empilé pleine largeur ; desktop = ligne. */}
            <div className="mb-4 flex flex-col gap-2 md:flex-row md:flex-wrap md:items-center">
              <button
                onClick={() => {
                  setSelectionMode((v) => !v);
                  setSelected(new Set());
                }}
                className={`w-full rounded-full border px-4 py-2 text-center text-sm font-semibold md:w-auto ${
                  selectionMode ? "border-orange bg-orange-50 text-orange" : "border-line bg-white text-ink hover:border-orange"
                }`}
              >
                {selectionMode ? "Quitter la sélection" : "Sélectionner"}
              </button>
              <button
                onClick={ouvrirReprise}
                className="w-full rounded-full border border-line bg-white px-4 py-2 text-center text-sm font-semibold text-ink hover:border-orange md:w-auto"
              >
                Reprendre les profs de la semaine passée
              </button>
              <div className="flex w-full flex-col gap-2 md:ml-auto md:w-auto md:flex-row md:items-center">
                {envoiPreview && envoiPreview.aEnvoyer > 0 && (
                  <span className="rounded-full bg-orange-50 px-3 py-1 text-center text-xs font-semibold text-orange">
                    Modifications non envoyées à {envoiPreview.aEnvoyer} prof{envoiPreview.aEnvoyer > 1 ? "s" : ""}
                  </span>
                )}
                <button
                  onClick={() => setEnvoiModal(true)}
                  disabled={!envoiPreview || envoiPreview.aEnvoyer === 0}
                  title={!envoiPreview || envoiPreview.aEnvoyer === 0 ? "Aucune modification à envoyer" : "Envoyer le planning aux profs concernés"}
                  className="w-full rounded-full bg-ink px-4 py-2 text-center text-sm font-bold text-white hover:bg-orange disabled:cursor-not-allowed disabled:opacity-40 md:w-auto"
                >
                  Envoyer le planning aux profs
                </button>
              </div>
            </div>

            <PlanningSemaine
              semaineISO={semaineISO}
              cours={coursActifs}
              affectations={affectations}
              profs={profs}
              periodes={periodes}
              onPrev={() => decalerSemaine(-7)}
              onNext={() => decalerSemaine(7)}
              onToday={() => setSemaineISO(toISODate(lundiDeLaSemaine(new Date())))}
              selectionMode={selectionMode}
              selected={selected}
              onToggleSelect={toggleSelect}
              onAddProf={(coursId) => setProfPicker({ kind: "single", coursId })}
              onRemoveProf={retirerProf}
              onPrevenir={(c) => setPrevenir(c)}
            />
          </>
        )}

        {tab === "cours" && (
          <CoursTab cours={cours} onChanged={chargerBase} flash={flash} />
        )}
        {tab === "profs" && (
          <ProfsTab profs={profs} onChanged={chargerBase} flash={flash} />
        )}
        {tab === "fermetures" && (
          <FermeturesTab periodes={periodes} onChanged={chargerBase} flash={flash} />
        )}
      </div>


      {prevenir && (
        <PrevenirPanel
          cours={prevenir}
          semaineISO={semaineISO}
          periodes={periodes}
          onClose={() => setPrevenir(null)}
          flash={flash}
        />
      )}

      {/* Choix d'un prof (ajout à un cours OU opération de masse) */}
      {profPicker && (() => {
        const exclus =
          profPicker.kind === "single" ? profIdsParCours.get(profPicker.coursId) ?? new Set<string>() : new Set<string>();
        const liste =
          profPicker.kind === "bulk" && profPicker.action === "remove"
            ? profsSurSelection
            : profsActifs.filter((p) => !exclus.has(p.id));
        const titre =
          profPicker.kind === "single"
            ? "Ajouter un professeur"
            : profPicker.action === "add"
              ? `Affecter un prof à ${selected.size} cours`
              : `Retirer un prof de ${selected.size} cours`;
        return (
          <div className="fixed inset-0 z-[60] flex items-center justify-center bg-ink/40 p-4">
            <div className="w-full max-w-sm rounded-[1.5rem] bg-white p-6">
              <h2 className="font-display text-lg font-extrabold uppercase text-ink">{titre}</h2>
              {liste.length === 0 ? (
                <p className="mt-3 text-sm text-smoke">
                  {profPicker.kind === "single"
                    ? "Tous les profs actifs sont déjà affectés à ce cours."
                    : "Aucun prof disponible pour cette action."}
                </p>
              ) : (
                <div className="mt-3 max-h-72 space-y-1 overflow-y-auto">
                  {liste.map((p) => (
                    <button
                      key={p.id}
                      disabled={busyAction}
                      onClick={() => appliquerProf(p.id)}
                      className="flex w-full items-center justify-between rounded-lg border border-line px-3 py-2 text-left text-sm hover:border-orange disabled:opacity-50"
                    >
                      <span className="font-semibold text-ink">{[p.prenom, p.nom].filter(Boolean).join(" ")}</span>
                      {!p.email && <span className="text-xs text-smoke">sans email</span>}
                    </button>
                  ))}
                </div>
              )}
              <button onClick={() => setProfPicker(null)} className="mt-4 w-full rounded-full border border-line px-5 py-2.5 text-sm font-semibold text-ink">
                Fermer
              </button>
            </div>
          </div>
        );
      })()}

      {/* Récap avant reprise des profs de la semaine passée */}
      {reprise && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-ink/40 p-4">
          <div className="w-full max-w-md rounded-[1.5rem] bg-white p-6 text-center">
            <h2 className="font-display text-lg font-extrabold uppercase text-ink">Reprendre les profs</h2>
            <p className="mt-3 text-sm text-smoke">
              Depuis la semaine du{" "}
              <strong className="text-ink">{new Date(reprise.source).toLocaleDateString("fr-FR", { dateStyle: "long" })}</strong>
              {reprise.sourceFermee ? " (la semaine passée était fermée, on reprend la dernière semaine ouverte)" : ""}.
            </p>
            <p className="mt-2 text-sm text-ink">
              <strong>{reprise.reprises}</strong> affectation{reprise.reprises > 1 ? "s" : ""} reprise{reprise.reprises > 1 ? "s" : ""},{" "}
              <strong>{reprise.ignorees}</strong> ignorée{reprise.ignorees > 1 ? "s" : ""} (jour fermé, cours désactivé ou déjà affecté).
            </p>
            <div className="mt-5 flex justify-center gap-3">
              <button onClick={() => setReprise(null)} disabled={busyAction} className="rounded-full border border-line px-5 py-2.5 text-sm font-semibold text-ink">
                Annuler
              </button>
              <button onClick={confirmerReprise} disabled={busyAction || reprise.reprises === 0} className="rounded-full bg-orange px-5 py-2.5 text-sm font-bold text-white hover:bg-orange-600 disabled:opacity-40">
                {busyAction ? "…" : "Reprendre"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Récap avant envoi groupé du planning */}
      {envoiModal && envoiPreview && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-ink/40 p-4">
          <div className="w-full max-w-md rounded-[1.5rem] bg-white p-6">
            <h2 className="font-display text-lg font-extrabold uppercase text-ink">Envoyer le planning</h2>
            <p className="mt-3 text-sm text-smoke">
              <strong className="text-ink">{envoiPreview.aEnvoyer}</strong> prof{envoiPreview.aEnvoyer > 1 ? "s" : ""} à notifier pour la semaine affichée.
            </p>
            <ul className="mt-3 max-h-60 space-y-1 overflow-y-auto text-sm">
              {envoiPreview.profs.map((p) => (
                <li key={p.prof_id} className="flex items-center justify-between rounded-lg border border-line px-3 py-2">
                  <span className="font-semibold text-ink">{p.nom}</span>
                  <span className="text-xs text-smoke">
                    {p.statut === "nouveau" ? "nouveau" : p.statut === "plus_de_cours" ? "plus de cours" : "mise à jour"}
                    {p.sansEmail ? " · sans email" : ""}
                  </span>
                </li>
              ))}
            </ul>
            <div className="mt-5 flex justify-end gap-3">
              <button onClick={() => setEnvoiModal(false)} disabled={busyAction} className="rounded-full border border-line px-5 py-2.5 text-sm font-semibold text-ink">
                Annuler
              </button>
              <button onClick={confirmerEnvoi} disabled={busyAction} className="rounded-full bg-orange px-5 py-2.5 text-sm font-bold text-white hover:bg-orange-600 disabled:opacity-50">
                {busyAction ? "Envoi…" : `Envoyer (${envoiPreview.aEnvoyer})`}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Barre d'action de sélection multiple (fixe en bas) */}
      {selectionMode && selected.size > 0 && (
        <div className="fixed inset-x-0 bottom-0 z-[55] border-t border-line bg-white/95 px-4 py-3 backdrop-blur">
          <div className="mx-auto flex max-w-3xl flex-wrap items-center justify-between gap-2">
            <span className="text-sm font-semibold text-ink">
              {selected.size} cours sélectionné{selected.size > 1 ? "s" : ""}
            </span>
            <div className="flex flex-wrap gap-2">
              <button onClick={() => setProfPicker({ kind: "bulk", action: "add" })} className="rounded-full bg-orange px-4 py-2 text-sm font-bold text-white hover:bg-orange-600">
                Affecter un prof
              </button>
              <button
                onClick={() => setProfPicker({ kind: "bulk", action: "remove" })}
                disabled={profsSurSelection.length === 0}
                title={profsSurSelection.length === 0 ? "Aucun prof à retirer sur la sélection" : ""}
                className="rounded-full border border-line bg-white px-4 py-2 text-sm font-semibold text-ink hover:border-orange disabled:opacity-40"
              >
                Retirer un prof
              </button>
              <button onClick={() => setSelected(new Set())} className="rounded-full border border-line bg-white px-4 py-2 text-sm font-semibold text-smoke hover:text-ink">
                Annuler
              </button>
            </div>
          </div>
        </div>
      )}

      {toast && (
        <div className="fixed bottom-6 right-6 z-[60] max-w-xs rounded-xl bg-ink px-5 py-3 text-sm font-bold text-white shadow-lg">
          {toast}
        </div>
      )}
    </div>
  );
}

// ============================================================================
// Vue COACH — planning en lecture seule (aucune action)
// ============================================================================
function PlanningCoach() {
  const [semaineISO, setSemaineISO] = useState(() => toISODate(lundiDeLaSemaine(new Date())));
  const [data, setData] = useState<{
    cours: Cours[];
    affectations: Affectation[];
    profs: ProfMinimal[];
    periodes: PeriodeFermeture[];
  }>({ cours: [], affectations: [], profs: [], periodes: [] });

  useEffect(() => {
    fetch(`/api/coach/planning?semaine=${semaineISO}`, { headers: adminAuthHeaders(), cache: "no-store" })
      .then((r) => r.json())
      .then((d) =>
        setData({ cours: d.cours ?? [], affectations: d.affectations ?? [], profs: d.profs ?? [], periodes: d.periodes ?? [] }),
      )
      .catch(() => {});
  }, [semaineISO]);

  function decaler(deltaJours: number) {
    const [y, m, d] = semaineISO.split("-").map(Number);
    const base = new Date(y, m - 1, d);
    base.setDate(base.getDate() + deltaJours);
    setSemaineISO(toISODate(lundiDeLaSemaine(base)));
  }

  return (
    <div className="max-w-5xl">
      <h1 className="font-display text-4xl font-black uppercase text-ink">Planning</h1>
      <p className="mt-2 text-sm text-smoke">Les cours de la semaine et les profs affectés (lecture seule).</p>
      <div className="mt-6 rounded-[1.5rem] border border-line bg-white p-4 sm:p-6">
        <PlanningSemaine
          semaineISO={semaineISO}
          cours={data.cours.filter((c) => c.actif)}
          affectations={data.affectations}
          profs={data.profs}
          periodes={data.periodes}
          onPrev={() => decaler(-7)}
          onNext={() => decaler(7)}
          onToday={() => setSemaineISO(toISODate(lundiDeLaSemaine(new Date())))}
          readOnly
        />
      </div>
    </div>
  );
}

// ============================================================================
// Onglet COURS
// ============================================================================
function CoursTab({
  cours,
  onChanged,
  flash,
}: {
  cours: Cours[];
  onChanged: () => void;
  flash: (m: string) => void;
}) {
  const [modale, setModale] = useState<{ mode: "create" } | { mode: "edit"; cours: Cours } | null>(null);
  const [openKeys, setOpenKeys] = useState<Set<string>>(new Set());
  const [groupeAction, setGroupeAction] =
    useState<{ type: "desactiver" | "supprimer"; groupe: Groupe; bloque?: string } | null>(null);
  const [busyGroupe, setBusyGroupe] = useState(false);

  const groupes = useMemo(() => grouperCours(cours), [cours]);

  function toggleOpen(k: string) {
    setOpenKeys((s) => {
      const n = new Set(s);
      if (n.has(k)) n.delete(k);
      else n.add(k);
      return n;
    });
  }

  async function basculerActif(c: Cours) {
    const res = await fetch("/api/admin/planning/cours", {
      method: "PATCH",
      headers: jsonHeaders(),
      body: JSON.stringify({ id: c.id, actif: !c.actif }),
    });
    if (res.ok) {
      flash(c.actif ? "Cours désactivé" : "Cours réactivé");
      onChanged();
    }
  }

  async function supprimerUn(c: Cours) {
    if (!confirm("Supprimer ce créneau ? Les affectations FUTURES liées seront supprimées.")) return;
    const res = await fetch(`/api/admin/planning/cours/${c.id}`, {
      method: "DELETE",
      headers: adminAuthHeaders(),
    });
    if (res.ok) {
      flash("Créneau supprimé");
      onChanged();
      return;
    }
    const d = await res.json().catch(() => ({}));
    // Garde-fou historique : proposer la désactivation à la place.
    if (res.status === 409) {
      if (confirm(`${d.error}\n\nDésactiver ce créneau à la place ?`)) basculerActif(c);
      return;
    }
    flash(d.error || "Échec de la suppression.");
  }

  // Actions de GROUPE (tous les créneaux d'un groupe), après confirmation.
  async function executerGroupe() {
    if (!groupeAction) return;
    setBusyGroupe(true);
    try {
      const { type, groupe } = groupeAction;
      if (type === "desactiver") {
        for (const c of groupe.creneaux) {
          await fetch("/api/admin/planning/cours", {
            method: "PATCH",
            headers: jsonHeaders(),
            body: JSON.stringify({ id: c.id, actif: false }),
          });
        }
        flash("Cours désactivé");
        setGroupeAction(null);
        onChanged();
        return;
      }
      // Suppression tout-ou-rien via l'endpoint dédié (garde-fou historique).
      const res = await fetch("/api/admin/planning/cours/bulk-delete", {
        method: "POST",
        headers: jsonHeaders(),
        body: JSON.stringify({ ids: groupe.creneaux.map((c) => c.id) }),
      });
      const d = await res.json().catch(() => ({}));
      if (res.ok) {
        flash("Cours supprimé");
        setGroupeAction(null);
        onChanged();
      } else if (res.status === 409) {
        setGroupeAction({ ...groupeAction, bloque: d.error || MSG_HISTORIQUE_COURS });
      } else {
        flash(d.error || "Échec de la suppression.");
      }
    } finally {
      setBusyGroupe(false);
    }
  }

  return (
    <div>
      {/* En-tête : bouton d'ouverture de la modale de création */}
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-smoke">
          {cours.length} créneau{cours.length > 1 ? "x" : ""} · {groupes.length} cours
        </p>
        <button
          onClick={() => setModale({ mode: "create" })}
          className="rounded-full bg-orange px-5 py-2.5 text-sm font-bold text-white hover:bg-orange-600"
        >
          + Nouveau cours
        </button>
      </div>

      {groupes.length === 0 ? (
        <p className="rounded-xl border border-dashed border-line bg-paper-2/40 py-8 text-center text-sm text-smoke">
          Aucun cours pour l&apos;instant. Cliquez sur « + Nouveau cours ».
        </p>
      ) : (
        <ul className="space-y-2">
          {groupes.map((g) => {
            const col = couleurCours(g.discipline, g.type_adherent);
            const ouvert = openKeys.has(g.key);
            const joursTxt = [...new Set(g.creneaux.map((c) => c.jour_semaine))]
              .sort((a, b) => (a ?? 0) - (b ?? 0))
              .map((j) => JOURS.find((x) => x.valeur === j)?.court)
              .filter(Boolean)
              .join(", ");
            const sallesDistinctes = [...new Set(g.creneaux.map((c) => (c.salle || "").trim()).filter(Boolean))];
            const sallesTxt =
              sallesDistinctes.length > 2 ? `${sallesDistinctes.length} salles` : sallesDistinctes.join(", ");
            const inactifTotal = g.creneaux.every((c) => !c.actif);
            return (
              <li
                key={g.key}
                className={`overflow-hidden rounded-xl border border-line ${inactifTotal ? "opacity-60" : "bg-white"}`}
              >
                {/* Ligne de groupe (repliée) */}
                <button
                  onClick={() => toggleOpen(g.key)}
                  className="flex w-full items-center gap-3 px-3 py-3 text-left hover:bg-paper-2/50"
                >
                  <span
                    className="h-8 w-1.5 shrink-0 rounded-full"
                    style={{ backgroundColor: col.bar }}
                  />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-bold text-ink">{g.libelle || "—"}</p>
                    <p className="truncate text-xs text-smoke">
                      {disciplineLabel(g.discipline)} · {publicLabel(g.type_adherent)} · {joursTxt}
                      {sallesTxt ? ` · ${sallesTxt}` : ""}
                    </p>
                  </div>
                  <span className="shrink-0 text-xs font-semibold text-smoke">
                    {g.creneaux.length} créneau{g.creneaux.length > 1 ? "x" : ""}
                  </span>
                  <span className={`shrink-0 text-smoke transition-transform ${ouvert ? "rotate-90" : ""}`}>›</span>
                </button>

                {/* Détail déplié : créneaux + actions */}
                {ouvert && (
                  <div className="border-t border-line">
                    <ul className="divide-y divide-line/60">
                      {g.creneaux.map((c) => (
                        <li key={c.id} className="flex items-center justify-between gap-3 px-3 py-2.5">
                          <div className="min-w-0">
                            <p className={`truncate text-sm font-semibold ${c.actif ? "text-ink" : "text-smoke line-through"}`}>
                              {jourLong(c.jour_semaine)} · {formatHeure(c.heure_debut)}–{formatHeure(c.heure_fin)}
                            </p>
                            <p className="truncate text-xs text-smoke">
                              {[c.salle, c.ville].filter(Boolean).join(" · ") || "—"}
                            </p>
                          </div>
                          <div className="flex shrink-0 gap-2">
                            <button
                              onClick={() => setModale({ mode: "edit", cours: c })}
                              className="text-xs font-semibold text-orange hover:underline"
                            >
                              Modifier
                            </button>
                            <button
                              onClick={() => basculerActif(c)}
                              className="text-xs font-semibold text-smoke hover:text-ink"
                            >
                              {c.actif ? "Désactiver" : "Réactiver"}
                            </button>
                            <button
                              onClick={() => supprimerUn(c)}
                              className="text-xs font-semibold text-red-600 hover:underline"
                            >
                              Supprimer
                            </button>
                          </div>
                        </li>
                      ))}
                    </ul>
                    <div className="flex flex-wrap justify-end gap-2 bg-paper-2/40 px-3 py-2">
                      <button
                        onClick={() => setGroupeAction({ type: "desactiver", groupe: g })}
                        className="rounded-full border border-line bg-white px-3 py-1.5 text-xs font-semibold text-ink hover:border-orange"
                      >
                        Désactiver tout
                      </button>
                      <button
                        onClick={() => setGroupeAction({ type: "supprimer", groupe: g })}
                        className="rounded-full border border-red-200 bg-white px-3 py-1.5 text-xs font-semibold text-red-600 hover:border-red-400"
                      >
                        Supprimer tout
                      </button>
                    </div>
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}

      {/* Modale création / édition (composant unique) */}
      {modale && (
        <CoursModale
          mode={modale.mode}
          cours={modale.mode === "edit" ? modale.cours : undefined}
          onClose={() => setModale(null)}
          onSaved={() => {
            setModale(null);
            onChanged();
          }}
          flash={flash}
        />
      )}

      {/* Confirmation action de groupe (récap chiffré) */}
      {groupeAction && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-ink/40 p-4">
          <div className="w-full max-w-sm rounded-[1.5rem] bg-white p-6 text-center">
            <h2 className="font-display text-lg font-extrabold uppercase text-ink">
              {groupeAction.bloque ? "Suppression impossible" : groupeAction.type === "supprimer" ? "Supprimer le cours" : "Désactiver le cours"}
            </h2>
            <p className="mt-3 text-sm text-smoke">
              {groupeAction.bloque ? (
                <span className="text-ink">{groupeAction.bloque}</span>
              ) : groupeAction.type === "supprimer" ? (
                <>
                  Supprimer les <strong>{groupeAction.groupe.creneaux.length}</strong> créneau
                  {groupeAction.groupe.creneaux.length > 1 ? "x" : ""} de{" "}
                  <strong className="text-ink">{groupeAction.groupe.libelle}</strong> ? Bloqué si un créneau a
                  un historique (semaine passée ou en cours) ; sinon supprimé avec ses affectations futures.
                </>
              ) : (
                <>
                  Désactiver les <strong>{groupeAction.groupe.creneaux.length}</strong> créneau
                  {groupeAction.groupe.creneaux.length > 1 ? "x" : ""} de{" "}
                  <strong className="text-ink">{groupeAction.groupe.libelle}</strong> ? Ils n&apos;apparaîtront
                  plus au calendrier (réactivables).
                </>
              )}
            </p>
            <div className="mt-5 flex justify-center gap-3">
              <button
                onClick={() => setGroupeAction(null)}
                disabled={busyGroupe}
                className="rounded-full border border-line px-5 py-2.5 text-sm font-semibold text-ink"
              >
                {groupeAction.bloque ? "Fermer" : "Annuler"}
              </button>
              {groupeAction.bloque ? (
                <button
                  onClick={() => setGroupeAction({ type: "desactiver", groupe: groupeAction.groupe })}
                  className="rounded-full bg-orange px-5 py-2.5 text-sm font-bold text-white hover:bg-orange-600"
                >
                  Désactiver
                </button>
              ) : (
                <button
                  onClick={executerGroupe}
                  disabled={busyGroupe}
                  className={`rounded-full px-5 py-2.5 text-sm font-bold text-white disabled:opacity-50 ${
                    groupeAction.type === "supprimer" ? "bg-red-600 hover:bg-red-700" : "bg-orange hover:bg-orange-600"
                  }`}
                >
                  {busyGroupe ? "…" : groupeAction.type === "supprimer" ? "Tout supprimer" : "Tout désactiver"}
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// Regroupe les cours À L'AFFICHAGE par libellé normalisé + discipline + public.
type Groupe = {
  key: string;
  libelle: string;
  discipline: string | null;
  type_adherent: string | null;
  creneaux: Cours[];
};
function grouperCours(cours: Cours[]): Groupe[] {
  const min = (t: string | null) => {
    if (!t) return 0;
    const [h, m] = t.split(":").map(Number);
    return h * 60 + (m || 0);
  };
  const m = new Map<string, Groupe>();
  for (const c of cours) {
    const key = `${(c.libelle ?? "").trim().toLowerCase()}|${c.discipline ?? ""}|${c.type_adherent ?? "tous"}`;
    let g = m.get(key);
    if (!g) {
      g = { key, libelle: c.libelle ?? "", discipline: c.discipline ?? null, type_adherent: c.type_adherent ?? null, creneaux: [] };
      m.set(key, g);
    }
    g.creneaux.push(c);
  }
  const arr = [...m.values()];
  const rangDisc = (d: string | null) => ["boxe_francaise", "savate", "prepa_physique"].indexOf(d ?? "");
  // Public : jeunes/enfants avant adultes ; "Tous" (null) au milieu.
  const rangPublic = (t: string | null) => (t === "jeune" ? 0 : t === "adulte" ? 2 : 1);
  arr.sort(
    (a, b) =>
      rangDisc(a.discipline) - rangDisc(b.discipline) ||
      rangPublic(a.type_adherent) - rangPublic(b.type_adherent) ||
      a.libelle.localeCompare(b.libelle),
  );
  for (const g of arr)
    g.creneaux.sort(
      (x, y) => (x.jour_semaine ?? 0) - (y.jour_semaine ?? 0) || min(x.heure_debut) - min(y.heure_debut),
    );
  return arr;
}

// ============================================================================
// Modale de création / édition d'un cours (composant unique)
// ============================================================================
function CoursModale({
  mode,
  cours,
  onClose,
  onSaved,
  flash,
}: {
  mode: "create" | "edit";
  cours?: Cours;
  onClose: () => void;
  onSaved: () => void;
  flash: (m: string) => void;
}) {
  const edit = mode === "edit";
  const initial = {
    libelle: cours?.libelle ?? "",
    discipline: cours?.discipline ?? "",
    type_adherent: edit ? cours?.type_adherent ?? "tous" : "",
    heure_debut: formatHeure(cours?.heure_debut ?? null) || "18:00",
    heure_fin: formatHeure(cours?.heure_fin ?? null) || "19:30",
    salle: cours?.salle ?? "",
    ville: cours?.ville ?? "",
  };
  const [form, setForm] = useState({ ...initial });
  const [jours, setJours] = useState<number[]>(edit ? [cours?.jour_semaine ?? 1] : [1]);
  const [jourEdit, setJourEdit] = useState(cours?.jour_semaine ?? 1);
  const [perJour, setPerJour] = useState(false);
  const [horJour, setHorJour] = useState<Record<number, { debut: string; fin: string; salle: string; ville: string }>>({});
  const [busy, setBusy] = useState(false);
  const [dirty, setDirty] = useState(false);

  const maj = (patch: Partial<typeof form>) => {
    setForm((f) => ({ ...f, ...patch }));
    setDirty(true);
  };
  function toggleJour(v: number) {
    setDirty(true);
    setJours((s) => (s.includes(v) ? s.filter((x) => x !== v) : [...s, v].sort((a, b) => a - b)));
  }
  function setJourChamp(j: number, champ: "debut" | "fin" | "salle" | "ville", val: string) {
    setDirty(true);
    setHorJour((h) => ({
      ...h,
      [j]: {
        debut: h[j]?.debut ?? form.heure_debut,
        fin: h[j]?.fin ?? form.heure_fin,
        salle: h[j]?.salle ?? form.salle,
        ville: h[j]?.ville ?? form.ville,
        [champ]: val,
      },
    }));
  }

  // Fermeture avec garde si des champs ont été modifiés.
  function tryClose() {
    if (dirty && !confirm("Fermer sans enregistrer ? Les informations saisies seront perdues.")) return;
    onClose();
  }
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") tryClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dirty]);

  const valide = form.libelle.trim() && form.discipline && form.type_adherent && (edit ? true : jours.length > 0);

  async function soumettre() {
    setBusy(true);
    try {
      const creneaux = jours.map((j) => ({
        jour_semaine: j,
        heure_debut: perJour ? horJour[j]?.debut ?? form.heure_debut : form.heure_debut,
        heure_fin: perJour ? horJour[j]?.fin ?? form.heure_fin : form.heure_fin,
        salle: perJour ? horJour[j]?.salle ?? form.salle : form.salle,
        ville: perJour ? horJour[j]?.ville ?? form.ville : form.ville,
      }));
      const body = edit ? { id: cours!.id, ...form, jour_semaine: jourEdit } : { ...form, creneaux };
      const res = await fetch("/api/admin/planning/cours", {
        method: edit ? "PATCH" : "POST",
        headers: jsonHeaders(),
        body: JSON.stringify(body),
      });
      const d = await res.json();
      if (!res.ok) {
        flash(d.error || "Échec de l'enregistrement.");
        return;
      }
      const n = d.crees ?? 1;
      flash(edit ? "Cours modifié ✓" : `${n} cours créé${n > 1 ? "s" : ""} ✓`);
      onSaved();
    } finally {
      setBusy(false);
    }
  }

  const champHeure =
    "focus-ring w-24 rounded-lg border border-line bg-paper-2 px-2 py-2 text-sm outline-none focus:border-orange";

  return (
    <div
      className="fixed inset-0 z-[60] flex items-stretch justify-center bg-ink/40 sm:items-center sm:p-4"
      onClick={tryClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="relative flex h-full w-full flex-col overflow-y-auto bg-white p-5 sm:h-auto sm:max-h-[90vh] sm:w-[720px] sm:max-w-[720px] sm:rounded-[1.5rem] sm:p-6"
      >
        <button
          onClick={tryClose}
          aria-label="Fermer"
          className="absolute right-4 top-4 flex h-8 w-8 items-center justify-center rounded-full text-xl text-smoke hover:bg-paper-2 hover:text-ink"
        >
          ×
        </button>
        <h2 className="font-display text-xl font-extrabold uppercase text-ink">
          {edit ? "Modifier le cours" : "Nouveau cours"}
        </h2>

        <div className="mt-4 space-y-3">
          <Field label="Libellé">
            <input
              value={form.libelle}
              onChange={(e) => maj({ libelle: e.target.value })}
              placeholder="Ex. Boxe française — Adultes"
              className={inputCls}
            />
          </Field>

          {edit ? (
            <Field label="Jour">
              <select value={String(jourEdit)} onChange={(e) => { setJourEdit(Number(e.target.value)); setDirty(true); }} className={inputCls}>
                {JOURS.map((j) => (
                  <option key={j.valeur} value={j.valeur}>
                    {j.long}
                  </option>
                ))}
              </select>
            </Field>
          ) : (
            <Field label="Jours (un cours créé par jour coché)">
              <div className="flex flex-wrap gap-1.5">
                {JOURS.map((j) => (
                  <label
                    key={j.valeur}
                    className={`cursor-pointer rounded-full border px-3 py-1.5 text-xs font-semibold transition-colors ${
                      jours.includes(j.valeur)
                        ? "border-orange bg-orange-50 text-orange"
                        : "border-line text-ink hover:border-orange/40"
                    }`}
                  >
                    <input type="checkbox" checked={jours.includes(j.valeur)} onChange={() => toggleJour(j.valeur)} className="sr-only" />
                    {j.court}
                  </label>
                ))}
              </div>
            </Field>
          )}

          <div className="grid grid-cols-2 gap-3">
            <Field label={edit ? "Début" : "Début (horaire commun)"}>
              <input type="time" value={form.heure_debut} onChange={(e) => maj({ heure_debut: e.target.value })} className={inputCls} />
            </Field>
            <Field label={edit ? "Fin" : "Fin (horaire commun)"}>
              <input type="time" value={form.heure_fin} onChange={(e) => maj({ heure_fin: e.target.value })} className={inputCls} />
            </Field>
          </div>

          {!edit && jours.length > 1 && (
            <div className="rounded-xl border border-line bg-paper-2/50 p-3">
              <label className="flex cursor-pointer items-center gap-2 text-sm font-semibold text-ink">
                <input type="checkbox" checked={perJour} onChange={(e) => { setPerJour(e.target.checked); setDirty(true); }} className="h-4 w-4 accent-orange" />
                Horaire / salle différents selon le jour
              </label>
              {perJour && (
                <div className="mt-3 space-y-2">
                  {jours.map((j) => (
                    <div key={j} className="flex flex-col gap-2 sm:flex-row sm:flex-nowrap sm:items-center">
                      <span className="w-10 shrink-0 text-xs font-bold text-smoke">
                        {JOURS.find((x) => x.valeur === j)?.court}
                      </span>
                      <input type="time" value={horJour[j]?.debut ?? form.heure_debut} onChange={(e) => setJourChamp(j, "debut", e.target.value)} className={champHeure} />
                      <span className="hidden text-smoke sm:inline">→</span>
                      <input type="time" value={horJour[j]?.fin ?? form.heure_fin} onChange={(e) => setJourChamp(j, "fin", e.target.value)} className={champHeure} />
                      <input value={horJour[j]?.salle ?? form.salle} onChange={(e) => setJourChamp(j, "salle", e.target.value)} placeholder="Salle" className="focus-ring min-w-0 flex-1 rounded-lg border border-line bg-paper-2 px-2 py-2 text-sm outline-none focus:border-orange" />
                      <input value={horJour[j]?.ville ?? form.ville} onChange={(e) => setJourChamp(j, "ville", e.target.value)} placeholder="Ville" className="focus-ring min-w-0 flex-1 rounded-lg border border-line bg-paper-2 px-2 py-2 text-sm outline-none focus:border-orange" />
                    </div>
                  ))}
                  <p className="text-xs text-smoke">Pré-rempli aux valeurs communes ; ajustez seulement les jours qui diffèrent.</p>
                </div>
              )}
            </div>
          )}

          <div className="grid grid-cols-2 gap-3">
            <Field label="Discipline">
              <select value={form.discipline} onChange={(e) => maj({ discipline: e.target.value })} className={inputCls}>
                <option value="" disabled>— Choisir —</option>
                {DISCIPLINES_COURS.map((d) => (
                  <option key={d.cle} value={d.cle}>{d.label}</option>
                ))}
              </select>
            </Field>
            <Field label="Public">
              <select value={form.type_adherent} onChange={(e) => maj({ type_adherent: e.target.value })} className={inputCls}>
                <option value="" disabled>— Choisir —</option>
                <option value="adulte">Adultes</option>
                <option value="jeune">Jeunes</option>
                <option value="tous">Tous (adultes + jeunes)</option>
              </select>
            </Field>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Salle (option)">
              <input value={form.salle} onChange={(e) => maj({ salle: e.target.value })} className={inputCls} />
            </Field>
            <Field label="Ville (option)">
              <input value={form.ville} onChange={(e) => maj({ ville: e.target.value })} className={inputCls} />
            </Field>
          </div>
        </div>

        <div className="mt-6 flex justify-end gap-2">
          <button onClick={tryClose} className="rounded-full border border-line px-5 py-2.5 text-sm font-semibold text-ink">
            Annuler
          </button>
          <button
            onClick={soumettre}
            disabled={busy || !valide}
            className="rounded-full bg-orange px-5 py-2.5 text-sm font-bold text-white hover:bg-orange-600 disabled:opacity-40"
          >
            {edit ? "Enregistrer" : jours.length > 1 ? `Ajouter (${jours.length} cours)` : "Ajouter"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ============================================================================
// Onglet PROFS
// ============================================================================
function ProfsTab({
  profs,
  onChanged,
  flash,
}: {
  profs: Prof[];
  onChanged: () => void;
  flash: (m: string) => void;
}) {
  const vide = { nom: "", prenom: "", email: "", telephone: "" };
  const [vue, setVue] = useState<"profs" | "heures">("profs");
  const [form, setForm] = useState({ ...vide });
  const [editId, setEditId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [openArchives, setOpenArchives] = useState(false);
  // Modale d'action (archive / suppression) avec récap chiffré.
  const [action, setAction] = useState<
    {
      prof: Prof;
      type: "archive" | "delete" | "delete_historique";
      historique: number;
      futures: number;
      heures: number;
      dejaEnvoye: boolean;
    } | null
  >(null);
  const [comprisPerte, setComprisPerte] = useState(false);

  const actifs = profs.filter((p) => p.actif);
  const archives = profs.filter((p) => !p.actif);

  function editer(p: Prof) {
    setEditId(p.id);
    setForm({
      nom: p.nom ?? "",
      prenom: p.prenom ?? "",
      email: p.email ?? "",
      telephone: p.telephone ?? "",
    });
  }
  function annuler() {
    setEditId(null);
    setForm({ ...vide });
  }

  async function soumettre() {
    setBusy(true);
    try {
      const res = await fetch("/api/admin/planning/profs", {
        method: editId ? "PATCH" : "POST",
        headers: jsonHeaders(),
        body: JSON.stringify(editId ? { id: editId, ...form } : form),
      });
      const d = await res.json();
      if (!res.ok) {
        flash(d.error || "Échec de l'enregistrement.");
        return;
      }
      flash(editId ? "Prof modifié ✓" : "Prof ajouté ✓");
      annuler();
      onChanged();
    } finally {
      setBusy(false);
    }
  }

  async function reactiver(p: Prof) {
    const res = await fetch("/api/admin/planning/profs", {
      method: "PATCH",
      headers: jsonHeaders(),
      body: JSON.stringify({ id: p.id, actif: true }),
    });
    if (res.ok) {
      flash("Prof réactivé");
      onChanged();
    }
  }

  // Ouvre la modale d'action : récupère l'état (historique / futures / heures) puis décide.
  async function demander(p: Prof, type: "archive" | "delete") {
    setComprisPerte(false);
    const res = await fetch(`/api/admin/planning/profs/${p.id}`, { headers: adminAuthHeaders(), cache: "no-store" });
    const d = await res.json();
    const historique = d.historique ?? 0;
    const base = { prof: p, historique, futures: d.futures ?? 0, heures: d.heures ?? 0, dejaEnvoye: !!d.dejaEnvoye };
    // Suppression avec historique → modale renforcée (avertissement + case à cocher).
    setAction({ ...base, type: type === "delete" && historique > 0 ? "delete_historique" : type });
  }

  async function archiver(p: Prof) {
    setBusy(true);
    try {
      const res = await fetch(`/api/admin/planning/profs/${p.id}`, { method: "POST", headers: adminAuthHeaders() });
      flash(res.ok ? "Prof archivé" : "Échec de l'archivage.");
      setAction(null);
      onChanged();
    } finally {
      setBusy(false);
    }
  }

  async function executer() {
    if (!action) return;
    setBusy(true);
    try {
      const p = action.prof;
      if (action.type === "archive") {
        const res = await fetch(`/api/admin/planning/profs/${p.id}`, { method: "POST", headers: adminAuthHeaders() });
        flash(res.ok ? "Prof archivé" : "Échec de l'archivage.");
      } else {
        // delete ou delete_historique : confirmer explicitement la perte si historique.
        const res = await fetch(`/api/admin/planning/profs/${p.id}`, {
          method: "DELETE",
          headers: jsonHeaders(),
          body: JSON.stringify({ confirmer_perte_historique: action.type === "delete_historique" }),
        });
        const d = await res.json().catch(() => ({}));
        if (res.ok) {
          flash("Prof supprimé");
          if (editId === p.id) annuler();
        } else {
          flash(d.error || "Échec de la suppression.");
        }
      }
      setAction(null);
      onChanged();
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      <div className="mb-4 flex gap-2">
        {(["profs", "heures"] as const).map((v) => (
          <button
            key={v}
            onClick={() => setVue(v)}
            className={`rounded-full px-4 py-2 text-sm font-semibold transition-colors ${
              vue === v ? "bg-ink text-white" : "border border-line bg-white text-ink/70 hover:border-orange"
            }`}
          >
            {v === "profs" ? "Profs" : "Heures"}
          </button>
        ))}
      </div>
      {vue === "heures" ? (
        <StatsHeures />
      ) : (
    <div className="grid gap-6 lg:grid-cols-[1fr_1.2fr]">
      <div className="rounded-xl border border-line p-4">
        <h3 className="font-display text-base font-extrabold uppercase text-ink">
          {editId ? "Modifier le prof" : "Nouveau prof"}
        </h3>
        <div className="mt-3 space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <Field label="Prénom">
              <input
                value={form.prenom}
                onChange={(e) => setForm((f) => ({ ...f, prenom: e.target.value }))}
                className={inputCls}
              />
            </Field>
            <Field label="Nom">
              <input
                value={form.nom}
                onChange={(e) => setForm((f) => ({ ...f, nom: e.target.value }))}
                className={inputCls}
              />
            </Field>
          </div>
          <Field label="Email">
            <input
              type="email"
              value={form.email}
              onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
              placeholder="Pour recevoir les mails d'affectation"
              className={inputCls}
            />
          </Field>
          <Field label="Téléphone (option)">
            <input
              value={form.telephone}
              onChange={(e) => setForm((f) => ({ ...f, telephone: e.target.value }))}
              className={inputCls}
            />
          </Field>
          <div className="flex gap-2">
            <button
              onClick={soumettre}
              disabled={busy || (!form.nom.trim() && !form.prenom.trim())}
              className="rounded-full bg-orange px-5 py-2.5 text-sm font-bold text-white hover:bg-orange-600 disabled:opacity-40"
            >
              {editId ? "Enregistrer" : "Ajouter"}
            </button>
            {editId && (
              <button
                onClick={annuler}
                className="rounded-full border border-line px-5 py-2.5 text-sm font-semibold text-ink"
              >
                Annuler
              </button>
            )}
          </div>
        </div>
      </div>

      <div>
        {actifs.length === 0 ? (
          <p className="text-sm text-smoke">Aucun prof actif pour l&apos;instant.</p>
        ) : (
          <ul className="space-y-2">
            {actifs.map((p) => (
              <li key={p.id} className="flex items-center justify-between gap-3 rounded-xl border border-line bg-white p-3">
                <div className="min-w-0">
                  <p className="truncate text-sm font-bold text-ink">{[p.prenom, p.nom].filter(Boolean).join(" ") || "—"}</p>
                  <p className="truncate text-xs text-smoke">
                    {p.email || "sans email"}
                    {p.telephone ? ` · ${p.telephone}` : ""}
                  </p>
                </div>
                <div className="flex shrink-0 gap-2">
                  <button onClick={() => editer(p)} className="text-xs font-semibold text-orange hover:underline">Modifier</button>
                  <button onClick={() => demander(p, "archive")} className="text-xs font-semibold text-smoke hover:text-ink hover:underline">Archiver</button>
                  <button onClick={() => demander(p, "delete")} className="text-xs font-semibold text-red-600 hover:underline">Supprimer</button>
                </div>
              </li>
            ))}
          </ul>
        )}

        {/* Profs archivés : repliés, atténués */}
        {archives.length > 0 && (
          <div className="mt-4">
            <button
              onClick={() => setOpenArchives((v) => !v)}
              className="flex items-center gap-2 text-xs font-semibold text-smoke hover:text-ink"
            >
              <span className={`transition-transform ${openArchives ? "rotate-90" : ""}`}>›</span>
              Profs archivés ({archives.length})
            </button>
            {openArchives && (
              <ul className="mt-2 space-y-2">
                {archives.map((p) => (
                  <li key={p.id} className="flex items-center justify-between gap-3 rounded-xl border border-line bg-paper-2 p-3 opacity-70">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-bold text-ink">{[p.prenom, p.nom].filter(Boolean).join(" ") || "—"}</p>
                      <p className="truncate text-xs text-smoke">{p.email || "sans email"}</p>
                    </div>
                    <button onClick={() => reactiver(p)} className="shrink-0 text-xs font-semibold text-orange hover:underline">Réactiver</button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
      </div>

      {/* Modale d'action prof (archive / suppression simple / suppression avec historique) */}
      {action && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-ink/40 p-4">
          <div className="w-full max-w-md rounded-[1.5rem] bg-white p-6 text-center">
            {(() => {
              const nom = [action.prof.prenom, action.prof.nom].filter(Boolean).join(" ") || "ce prof";

              // Suppression avec HISTORIQUE : avertissement fort + case à cocher.
              if (action.type === "delete_historique") {
                return (
                  <>
                    <h2 className="font-display text-lg font-extrabold uppercase text-ink">Supprimer ou archiver ?</h2>
                    <p className="mt-3 text-sm text-smoke">
                      Supprimer <strong className="text-ink">{nom}</strong> efface aussi tout son historique de cours.
                      L&apos;archiver le retire du planning en gardant ses heures.
                    </p>
                    <div className="mt-3 rounded-xl border border-line bg-paper-2 p-3 text-left text-sm text-ink">
                      <p><strong>{action.historique}</strong> cours donnés (passés et en cours) · <strong>{action.heures}</strong> h</p>
                      <p><strong>{action.futures}</strong> cours à venir {action.futures > 1 ? "seront libérés" : "sera libéré"}</p>
                      {action.dejaEnvoye && (
                        <p className="mt-1 text-xs text-smoke">
                          Un planning lui a déjà été envoyé pour une semaine en cours ou à venir : il ne recevra pas de mail l&apos;informant de son retrait.
                        </p>
                      )}
                    </div>
                    <label className="mt-3 flex cursor-pointer items-start gap-2 text-left text-xs text-ink">
                      <input type="checkbox" checked={comprisPerte} onChange={(e) => setComprisPerte(e.target.checked)} className="mt-0.5 h-4 w-4 accent-red-600" />
                      Je comprends que l&apos;historique sera perdu.
                    </label>
                    <div className="mt-5 flex flex-wrap justify-center gap-3">
                      <button onClick={() => setAction(null)} disabled={busy} className="rounded-full border border-line px-5 py-2.5 text-sm font-semibold text-ink">Annuler</button>
                      <button onClick={() => archiver(action.prof)} disabled={busy} className="rounded-full bg-orange px-5 py-2.5 text-sm font-bold text-white hover:bg-orange-600 disabled:opacity-50">
                        {busy ? "…" : "Archiver"}
                      </button>
                      <button
                        onClick={executer}
                        disabled={busy || !comprisPerte}
                        title={!comprisPerte ? "Cochez la case pour confirmer la perte de l'historique" : ""}
                        className="rounded-full bg-red-600 px-5 py-2.5 text-sm font-bold text-white hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-40"
                      >
                        Supprimer définitivement
                      </button>
                    </div>
                  </>
                );
              }

              // Archivage OU suppression simple (aucun historique).
              const titre = action.type === "archive" ? "Archiver le prof" : "Supprimer le prof";
              return (
                <>
                  <h2 className="font-display text-lg font-extrabold uppercase text-ink">{titre}</h2>
                  <p className="mt-3 text-sm text-smoke">
                    {action.type === "archive" ? (
                      <>
                        Archiver <strong className="text-ink">{nom}</strong> : il ne sera plus proposé.{" "}
                        <strong>{action.futures}</strong> cours à venir {action.futures > 1 ? "seront libérés" : "sera libéré"} ; ses heures passées restent.
                      </>
                    ) : (
                      <>
                        Supprimer <strong className="text-ink">{nom}</strong> ? Aucun historique.{" "}
                        {action.futures > 0 ? <><strong>{action.futures}</strong> cours à venir {action.futures > 1 ? "seront libérés" : "sera libéré"}.</> : "Aucune affectation."}
                      </>
                    )}
                  </p>
                  <div className="mt-5 flex justify-center gap-3">
                    <button onClick={() => setAction(null)} disabled={busy} className="rounded-full border border-line px-5 py-2.5 text-sm font-semibold text-ink">Annuler</button>
                    <button
                      onClick={executer}
                      disabled={busy}
                      className={`rounded-full px-5 py-2.5 text-sm font-bold text-white disabled:opacity-50 ${action.type === "delete" ? "bg-red-600 hover:bg-red-700" : "bg-orange hover:bg-orange-600"}`}
                    >
                      {busy ? "…" : action.type === "archive" ? "Archiver" : "Supprimer"}
                    </button>
                  </div>
                </>
              );
            })()}
          </div>
        </div>
      )}
    </div>
      )}
    </div>
  );
}

// ============================================================================
// Stats d'heures profs (ADMIN uniquement) — sous-vue de l'onglet Profs
// ============================================================================
type StatsData = {
  parProf: StatProf[];
  totalHeuresRealisees: number;
  totalHeuresPrevues: number;
  totalRealises: number;
  totalPrevus: number;
};
function StatsHeures() {
  const now = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  const [mode, setMode] = useState<"mois" | "saison">("mois");
  const [annee, setAnnee] = useState(now.getFullYear());
  const [mois, setMois] = useState(now.getMonth());
  const [data, setData] = useState<StatsData | null>(null);
  const [open, setOpen] = useState<Set<string>>(new Set());

  const { debut, fin, label, fichier } = useMemo(() => {
    if (mode === "saison") {
      const startY = now.getMonth() >= 8 ? now.getFullYear() : now.getFullYear() - 1;
      return { debut: `${startY}-09-01`, fin: `${startY + 1}-06-30`, label: `Saison ${startY}-${startY + 1}`, fichier: `heures-profs-saison-${startY}-${startY + 1}` };
    }
    const dernier = new Date(annee, mois + 1, 0).getDate();
    return {
      debut: `${annee}-${pad(mois + 1)}-01`,
      fin: `${annee}-${pad(mois + 1)}-${pad(dernier)}`,
      label: new Date(annee, mois, 1).toLocaleDateString("fr-FR", { month: "long", year: "numeric" }),
      fichier: `heures-profs-${annee}-${pad(mois + 1)}`,
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode, annee, mois]);

  useEffect(() => {
    fetch(`/api/admin/planning/stats?debut=${debut}&fin=${fin}`, { headers: adminAuthHeaders(), cache: "no-store" })
      .then((r) => r.json())
      .then((d) => setData(d?.parProf ? d : null))
      .catch(() => setData(null));
  }, [debut, fin]);

  function decalerMois(delta: number) {
    const d = new Date(annee, mois + delta, 1);
    setAnnee(d.getFullYear());
    setMois(d.getMonth());
  }
  function toggle(id: string) {
    setOpen((s) => {
      const n = new Set(s);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });
  }

  const csvCell = (s: string) => (/[";\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s);
  function exportCSV() {
    if (!data) return;
    const sep = ";";
    const lignes = [["Prof", "Date", "Jour", "Horaire", "Libellé", "Discipline", "Durée (h)", "Statut"].join(sep)];
    for (const p of data.parProf)
      for (const o of p.occurrences)
        lignes.push(
          [p.nom, o.date, jourLong(o.jour), `${heureFr(o.heure_debut)}-${heureFr(o.heure_fin)}`, o.libelle, disciplineLabel(o.discipline), String(o.dureeH).replace(".", ","), o.realise ? "réalisé" : "prévu"]
            .map(csvCell)
            .join(sep),
        );
    const blob = new Blob(["﻿" + lignes.join("\r\n")], { type: "text/csv;charset=utf-8;" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `${fichier}.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
  }

  const vide = !data || data.parProf.length === 0;

  return (
    <div>
      {/* Contrôles de période */}
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <div className="flex gap-1">
          {(["mois", "saison"] as const).map((m) => (
            <button
              key={m}
              onClick={() => setMode(m)}
              className={`rounded-full px-3 py-1.5 text-xs font-semibold ${mode === m ? "bg-ink text-white" : "border border-line bg-white text-ink/70 hover:border-orange"}`}
            >
              {m === "mois" ? "Par mois" : "Saison entière"}
            </button>
          ))}
        </div>
        {mode === "mois" && (
          <div className="flex items-center gap-2">
            <button onClick={() => decalerMois(-1)} aria-label="Mois précédent" className="flex h-8 w-8 items-center justify-center rounded-full border border-line hover:border-orange">‹</button>
            <span className="min-w-[9rem] text-center text-sm font-bold capitalize text-ink">{label}</span>
            <button onClick={() => decalerMois(1)} aria-label="Mois suivant" className="flex h-8 w-8 items-center justify-center rounded-full border border-line hover:border-orange">›</button>
          </div>
        )}
        {mode === "saison" && <span className="text-sm font-bold text-ink">{label}</span>}
        <button
          onClick={exportCSV}
          disabled={vide}
          title={vide ? "Aucune donnée à exporter" : "Exporter en CSV (Excel)"}
          className="ml-auto rounded-full border border-line bg-white px-4 py-2 text-sm font-semibold text-ink hover:border-orange disabled:cursor-not-allowed disabled:opacity-40"
        >
          Export CSV
        </button>
      </div>

      {vide ? (
        <p className="rounded-xl border border-dashed border-line bg-paper-2/40 py-8 text-center text-sm text-smoke">
          Aucune heure sur cette période.
        </p>
      ) : (
        <>
          <ul className="space-y-2">
            {data!.parProf.map((p) => {
              const ouvert = open.has(p.prof_id);
              return (
                <li key={p.prof_id} className={`rounded-xl border border-line ${p.actif ? "bg-white" : "bg-paper-2 opacity-70"}`}>
                  <button onClick={() => toggle(p.prof_id)} className="flex w-full items-center gap-3 px-3 py-3 text-left hover:bg-paper-2/50">
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-bold text-ink">
                        {p.nom}
                        {!p.actif && <span className="ml-2 rounded-full bg-paper-2 px-2 py-0.5 text-[10px] font-semibold text-smoke">archivé</span>}
                      </p>
                      <p className="truncate text-xs text-smoke">
                        Réalisé : <strong className="text-ink">{p.nbRealises}</strong> cours · {formatDureeHeures(p.heuresRealisees)}
                        {p.nbPrevus > 0 && (
                          <> · à venir : {p.nbPrevus} cours · {formatDureeHeures(p.heuresPrevues)}</>
                        )}
                      </p>
                    </div>
                    <span className={`shrink-0 text-smoke transition-transform ${ouvert ? "rotate-90" : ""}`}>›</span>
                  </button>
                  {ouvert && (
                    <ul className="divide-y divide-line/60 border-t border-line">
                      {p.occurrences.map((o, i) => (
                        <li key={i} className="flex items-center justify-between gap-3 px-3 py-2 text-xs">
                          <span className="text-ink">
                            {formatDateCours(o.date)} · {heureFr(o.heure_debut)}–{heureFr(o.heure_fin)} · {o.libelle}
                          </span>
                          <span className={`shrink-0 font-semibold ${o.realise ? "text-green-700" : "text-blue-600"}`}>
                            {formatDureeHeures(o.dureeH)} · {o.realise ? "réalisé" : "prévu"}
                          </span>
                        </li>
                      ))}
                    </ul>
                  )}
                </li>
              );
            })}
          </ul>
          <div className="mt-3 flex justify-between rounded-xl bg-ink px-4 py-3 text-sm font-bold text-white">
            <span>Total</span>
            <span>
              Réalisé {formatDureeHeures(data!.totalHeuresRealisees)} ({data!.totalRealises} cours)
              {data!.totalPrevus > 0 && <> · à venir {formatDureeHeures(data!.totalHeuresPrevues)} ({data!.totalPrevus})</>}
            </span>
          </div>
        </>
      )}
    </div>
  );
}

// ============================================================================
// Onglet FERMETURES
// ============================================================================
function FermeturesTab({
  periodes,
  onChanged,
  flash,
}: {
  periodes: PeriodeFermeture[];
  onChanged: () => void;
  flash: (m: string) => void;
}) {
  // + 2 semaines à partir d'une date ISO.
  const plus2Semaines = (iso: string) => {
    const [y, m, d] = iso.split("-").map(Number);
    const dt = new Date(y, m - 1, d);
    dt.setDate(dt.getDate() + 14);
    return toISODate(dt);
  };

  const aujourdhui = toISODate(new Date());
  const [libelle, setLibelle] = useState("");
  // Début pré-rempli à aujourd'hui ; fin à +2 semaines (modifiable ensuite).
  const [debut, setDebut] = useState(aujourdhui);
  const [fin, setFin] = useState(() => plus2Semaines(aujourdhui));
  const [finTouchee, setFinTouchee] = useState(false); // ne pas écraser une fin saisie main
  const [busy, setBusy] = useState(false);

  // Changer le début recalcule la fin à +2 semaines, SAUF si l'admin a déjà
  // ajusté la fin manuellement.
  function onChangeDebut(v: string) {
    setDebut(v);
    if (!finTouchee) setFin(plus2Semaines(v));
  }
  function onChangeFin(v: string) {
    setFin(v);
    setFinTouchee(true);
  }

  async function ajouter() {
    setBusy(true);
    try {
      const res = await fetch("/api/admin/planning/fermetures", {
        method: "POST",
        headers: jsonHeaders(),
        body: JSON.stringify({ libelle, date_debut: debut, date_fin: fin }),
      });
      const d = await res.json();
      if (!res.ok) {
        flash(d.error || "Échec de l'ajout.");
        return;
      }
      flash("Période ajoutée ✓");
      setLibelle("");
      setDebut(aujourdhui);
      setFin(plus2Semaines(aujourdhui));
      setFinTouchee(false);
      onChanged();
    } finally {
      setBusy(false);
    }
  }

  async function supprimer(id: string) {
    const res = await fetch("/api/admin/planning/fermetures", {
      method: "DELETE",
      headers: jsonHeaders(),
      body: JSON.stringify({ id }),
    });
    if (res.ok) {
      flash("Période supprimée");
      onChanged();
    }
  }

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_1.2fr]">
      <div className="rounded-xl border border-line p-4">
        <h3 className="font-display text-base font-extrabold uppercase text-ink">
          Nouvelle fermeture
        </h3>
        <div className="mt-3 space-y-3">
          <Field label="Libellé (option)">
            <input
              value={libelle}
              onChange={(e) => setLibelle(e.target.value)}
              placeholder="Ex. Vacances de Noël"
              className={inputCls}
            />
          </Field>
          <DatePicker label="Début" value={debut} onChange={onChangeDebut} />
          <DatePicker label="Fin" value={fin} onChange={onChangeFin} />
          <button
            onClick={ajouter}
            disabled={busy || !debut || !fin}
            className="rounded-full bg-orange px-5 py-2.5 text-sm font-bold text-white hover:bg-orange-600 disabled:opacity-40"
          >
            Ajouter
          </button>
        </div>
      </div>

      <div>
        {periodes.length === 0 ? (
          <p className="text-sm text-smoke">Aucune période de fermeture.</p>
        ) : (
          <ul className="space-y-2">
            {periodes.map((p) => (
              <li
                key={p.id}
                className="flex items-center justify-between gap-3 rounded-xl border border-line bg-white p-3"
              >
                <div className="min-w-0">
                  <p className="truncate text-sm font-bold text-ink">{p.libelle || "Fermeture"}</p>
                  <p className="truncate text-xs text-smoke">
                    du {new Date(p.date_debut).toLocaleDateString("fr-FR")} au{" "}
                    {new Date(p.date_fin).toLocaleDateString("fr-FR")}
                  </p>
                </div>
                <button
                  onClick={() => supprimer(p.id)}
                  className="shrink-0 text-xs font-semibold text-red-600 hover:underline"
                >
                  Supprimer
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

// ============================================================================
// Panneau « Prévenir les adhérents d'un cours » (mailing ciblé par discipline)
// ============================================================================
function PrevenirPanel({
  cours,
  semaineISO,
  periodes,
  onClose,
  flash,
}: {
  cours: Cours;
  semaineISO: string;
  periodes: PeriodeFermeture[];
  onClose: () => void;
  flash: (m: string) => void;
}) {
  const libelle = cours.libelle ?? "ce cours";

  // Cours d'ORIGINE (occurrence de la semaine affichée) — rappelé en entier.
  const origDateISO = toISODate(dateDuJour(semaineISO, cours.jour_semaine ?? 1));
  const origDebut = formatHeure(cours.heure_debut) || "18:00"; // "HH:MM"
  const origFin = formatHeure(cours.heure_fin) || "19:00";
  const origSalle = cours.salle ?? "";
  const origVille = cours.ville ?? "";

  type Motif = "annule" | "deplace" | "reporte";
  const [etape, setEtape] = useState<"motif" | "compose">("motif");
  const [motif, setMotif] = useState<Motif | null>(null);
  const [raison, setRaison] = useState(""); // annulé (optionnel)
  const [nvDate, setNvDate] = useState(""); // reporté (ISO)
  const [nvDebut, setNvDebut] = useState(origDebut);
  const [nvFin, setNvFin] = useState(origFin);
  const [nvSalle, setNvSalle] = useState(origSalle);
  const [nvVille, setNvVille] = useState(origVille);

  const [objet, setObjet] = useState("");
  const [contenu, setContenu] = useState("");
  const [contenuEdite, setContenuEdite] = useState(false);
  const [cible, setCible] = useState<{ count: number; emails: number; exemples: string[] } | null>(null);
  const [confirm, setConfirm] = useState(false);
  const [sending, setSending] = useState(false);
  const [resultat, setResultat] = useState<{ emails: number; personnes: number } | null>(null);

  useEffect(() => {
    fetch(`/api/admin/planning/cours/${cours.id}/prevenir`, {
      method: "POST",
      headers: jsonHeaders(),
      body: JSON.stringify({ preview: true }),
    })
      .then((r) => r.json())
      .then((d) => setCible({ count: d.count ?? 0, emails: d.emails ?? 0, exemples: d.exemples ?? [] }))
      .catch(() => setCible({ count: 0, emails: 0, exemples: [] }));
  }, [cours.id]);

  const origPlage = plageHoraire(cours.heure_debut, cours.heure_fin);
  const origDateFr = formatDateCours(origDateISO);
  const horaireChange = nvDebut !== origDebut || nvFin !== origFin;
  const lieuChange = formatLieu(nvSalle, nvVille) !== formatLieu(origSalle, origVille);

  // Gabarit auto-généré (helper partagé, jetons {{salutation}}/{{concerne}}).
  function genererMail(m: Motif): { objet: string; contenu: string } {
    const origine = { dateISO: origDateISO, heure_debut: origDebut, heure_fin: origFin, salle: origSalle, ville: origVille };
    const nouveau =
      m === "annule"
        ? undefined
        : { dateISO: m === "reporte" ? nvDate || origDateISO : origDateISO, heure_debut: nvDebut, heure_fin: nvFin, salle: nvSalle, ville: nvVille };
    const prochainISO = m === "annule" ? prochaineOccurrence(cours.jour_semaine, semaineISO, periodes) : null;
    return genererMailPrevenir({ libelle, motif: m, origine, nouveau, raison, prochainISO, clubNom: CLUB.nom });
  }

  // Aperçu structuré envoyé au serveur (encadré Avant / Désormais).
  function construireApercu(m: Motif) {
    return {
      motif: m,
      origine: { dateISO: origDateISO, heure_debut: origDebut, heure_fin: origFin, salle: origSalle, ville: origVille },
      nouveau:
        m === "annule"
          ? undefined
          : {
              dateISO: m === "reporte" ? nvDate || origDateISO : origDateISO,
              heure_debut: nvDebut,
              heure_fin: nvFin,
              salle: nvSalle,
              ville: nvVille,
            },
    };
  }

  const motifValide =
    motif === "annule" ||
    (motif === "deplace" && (horaireChange || lieuChange)) ||
    (motif === "reporte" && !!nvDate);

  function continuer() {
    if (!motif || !motifValide) return;
    // Ne pas écraser une édition manuelle sans prévenir.
    if (contenuEdite && contenu.trim() && !window.confirm("Le message a été modifié à la main. Régénérer et perdre vos modifications ?")) {
      setEtape("compose");
      return;
    }
    const g = genererMail(motif);
    setObjet(g.objet);
    setContenu(g.contenu);
    setContenuEdite(false);
    setEtape("compose");
  }

  const MOTIFS: { cle: Motif; label: string; emoji: string }[] = [
    { cle: "annule", label: "Annulé", emoji: "🚫" },
    { cle: "deplace", label: "Déplacé", emoji: "📍" },
    { cle: "reporte", label: "Reporté", emoji: "🗓️" },
  ];

  async function envoyer() {
    setSending(true);
    try {
      const res = await fetch(`/api/admin/planning/cours/${cours.id}/prevenir`, {
        method: "POST",
        headers: jsonHeaders(),
        body: JSON.stringify({ objet, contenu, apercu: motif ? construireApercu(motif) : undefined }),
      });
      const d = await res.json();
      if (!res.ok || !d.success) {
        setConfirm(false);
        flash(d.error || "L'envoi a échoué.");
        return;
      }
      setResultat({ emails: d.emails ?? 0, personnes: d.personnes ?? 0 });
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="fixed inset-0 z-[55] flex items-center justify-center bg-ink/40 p-4">
      <div className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-[1.5rem] bg-white p-6">
        {resultat ? (
          <div className="text-center">
            <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-green-100 text-2xl">
              ✅
            </div>
            <h2 className="font-display mt-4 text-xl font-extrabold uppercase text-ink">
              Adhérents prévenus
            </h2>
            <p className="mt-3 text-sm text-smoke">
              <strong className="text-ink">{resultat.personnes}</strong> adhérent
              {resultat.personnes > 1 ? "s" : ""} touché{resultat.personnes > 1 ? "s" : ""} via{" "}
              <strong className="text-ink">{resultat.emails}</strong> email
              {resultat.emails > 1 ? "s" : ""}.
            </p>
            <button
              onClick={onClose}
              className="mt-6 rounded-full bg-orange px-6 py-2.5 text-sm font-bold text-white hover:bg-orange-600"
            >
              Fermer
            </button>
          </div>
        ) : (
          <>
            <h2 className="font-display text-lg font-extrabold uppercase text-ink">
              Prévenir les adhérents
            </h2>
            <div className="mt-3 rounded-xl border border-line bg-paper-2 p-3 text-sm">
              <p className="font-bold text-ink">{cours.libelle}</p>
              <p className="text-smoke">
                {origDateFr} · {origPlage} · {disciplineLabel(cours.discipline)}
                {` · ${publicLabel(cours.type_adherent)}`}
              </p>
            </div>

            <div className="mt-3 rounded-xl bg-orange-50 p-3 text-sm font-semibold text-orange">
              {cible === null
                ? "Calcul de la cible…"
                : `${cible.count} adhérent${cible.count > 1 ? "s" : ""} concerné${cible.count > 1 ? "s" : ""} · ${cible.emails} email${cible.emails > 1 ? "s" : ""}`}
              <span className="mt-1 block text-xs font-normal text-smoke">
                Ciblage : {disciplineLabel(cours.discipline)}
                {` · ${cours.type_adherent ? publicLabel(cours.type_adherent) : "tous publics"}`}
                {" "}· adhérents actifs de la saison en cours (désinscrits et adresses invalides exclus à l&apos;envoi).
              </span>
              {cible && cible.exemples.length > 0 && (
                <div className="mt-2 border-t border-orange/20 pt-2 text-xs font-normal text-smoke">
                  <span className="font-semibold text-ink">Ouvertures (exemples) :</span>
                  {cible.exemples.map((ex, i) => (
                    <span key={i} className="mt-0.5 block italic">« {ex} »</span>
                  ))}
                </div>
              )}
            </div>

            {/* Étape 1 — motif (pré-remplit le mail) */}
            {etape === "motif" && (
              <div className="mt-4">
                <p className="mb-2 text-sm font-semibold text-ink">Que se passe-t-il ?</p>
                <div className="grid grid-cols-3 gap-2">
                  {MOTIFS.map((m) => (
                    <button
                      key={m.cle}
                      onClick={() => setMotif(m.cle)}
                      className={`rounded-xl border px-3 py-3 text-center text-sm font-semibold transition-colors ${
                        motif === m.cle
                          ? "border-orange bg-orange-50 text-orange"
                          : "border-line text-ink hover:border-orange/40"
                      }`}
                    >
                      <span className="mb-0.5 block text-lg">{m.emoji}</span>
                      {m.label}
                    </button>
                  ))}
                </div>

                {motif === "annule" && (
                  <label className="mt-4 block">
                    <span className="mb-1.5 block text-sm font-semibold text-ink">Raison (optionnel)</span>
                    <input
                      value={raison}
                      onChange={(e) => setRaison(e.target.value)}
                      placeholder="Ex. professeur absent"
                      className={inputCls}
                    />
                  </label>
                )}
                {(motif === "deplace" || motif === "reporte") && (
                  <div className="mt-4 space-y-3">
                    {motif === "reporte" && (
                      <DatePicker label="Nouvelle date" value={nvDate} onChange={setNvDate} />
                    )}
                    <div className="grid grid-cols-2 gap-3">
                      <label className="block">
                        <span className="mb-1.5 block text-sm font-semibold text-ink">Nouveau début</span>
                        <input type="time" value={nvDebut} onChange={(e) => setNvDebut(e.target.value)} className={inputCls} />
                      </label>
                      <label className="block">
                        <span className="mb-1.5 block text-sm font-semibold text-ink">Nouvelle fin</span>
                        <input type="time" value={nvFin} onChange={(e) => setNvFin(e.target.value)} className={inputCls} />
                      </label>
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      <label className="block">
                        <span className="mb-1.5 block text-sm font-semibold text-ink">Salle</span>
                        <input value={nvSalle} onChange={(e) => setNvSalle(e.target.value)} placeholder="Salle" className={inputCls} />
                      </label>
                      <label className="block">
                        <span className="mb-1.5 block text-sm font-semibold text-ink">Ville</span>
                        <input value={nvVille} onChange={(e) => setNvVille(e.target.value)} placeholder="Ville" className={inputCls} />
                      </label>
                    </div>
                    <p className="text-xs text-smoke">
                      Pré-rempli au créneau d&apos;origine ; ne changez que ce qui bouge.
                      {motif === "deplace" && !horaireChange && !lieuChange ? " (Modifiez l'horaire ou le lieu.)" : ""}
                    </p>
                  </div>
                )}

                <div className="mt-5 flex gap-2">
                  <button
                    onClick={onClose}
                    className="rounded-full border border-line px-5 py-2.5 text-sm font-semibold text-ink"
                  >
                    Annuler
                  </button>
                  <button
                    onClick={continuer}
                    disabled={!motif || !motifValide}
                    className="rounded-full bg-ink px-5 py-2.5 text-sm font-bold text-white hover:bg-orange disabled:opacity-40"
                  >
                    Continuer
                  </button>
                </div>
              </div>
            )}

            {/* Étape 2 — mail pré-rempli, éditable, puis envoi */}
            {etape === "compose" && (
            <>
            <button
              onClick={() => setEtape("motif")}
              className="mt-4 text-sm font-semibold text-smoke hover:text-ink"
            >
              ← Changer le motif
            </button>
            <label className="mt-2 block">
              <span className="mb-1.5 block text-sm font-semibold text-ink">Objet</span>
              <input
                value={objet}
                onChange={(e) => setObjet(e.target.value)}
                className={inputCls}
              />
            </label>
            <label className="mt-3 block">
              <span className="mb-1.5 block text-sm font-semibold text-ink">Message</span>
              <textarea
                value={contenu}
                onChange={(e) => {
                  setContenu(e.target.value);
                  setContenuEdite(true);
                }}
                rows={10}
                className="focus-ring w-full rounded-xl border border-line bg-paper-2 px-4 py-3 text-sm leading-relaxed outline-none focus:border-orange"
              />
              <span className="mt-1 block text-xs text-smoke">
                Variable disponible : {"{{prenom}}"}.
              </span>
            </label>

            {confirm ? (
              <div className="mt-4 rounded-xl border border-orange/30 bg-orange-50 p-3">
                <p className="text-sm text-ink">
                  Envoyer à <strong>{cible?.count ?? 0}</strong> adhérent
                  {(cible?.count ?? 0) > 1 ? "s" : ""} ? Les désinscrits sont exclus. Action
                  irréversible.
                </p>
                <div className="mt-3 flex gap-2">
                  <button
                    onClick={() => setConfirm(false)}
                    disabled={sending}
                    className="rounded-full border border-line px-4 py-2 text-sm font-semibold text-ink"
                  >
                    Annuler
                  </button>
                  <button
                    onClick={envoyer}
                    disabled={sending}
                    className="rounded-full bg-orange px-4 py-2 text-sm font-bold text-white hover:bg-orange-600 disabled:opacity-50"
                  >
                    {sending ? "Envoi…" : "Confirmer l'envoi"}
                  </button>
                </div>
              </div>
            ) : (
              <div className="mt-5 flex gap-2">
                <button
                  onClick={onClose}
                  className="rounded-full border border-line px-5 py-2.5 text-sm font-semibold text-ink"
                >
                  Annuler
                </button>
                <button
                  onClick={() => setConfirm(true)}
                  disabled={!objet.trim() || !contenu.trim() || !cible || cible.count === 0}
                  className="rounded-full bg-orange px-5 py-2.5 text-sm font-bold text-white hover:bg-orange-600 disabled:opacity-40"
                >
                  Prévenir {cible ? `(${cible.count})` : ""}
                </button>
              </div>
            )}
            </>
            )}
          </>
        )}
      </div>
    </div>
  );
}

// ---- Petits helpers UI partagés ----
const inputCls =
  "focus-ring w-full rounded-lg border border-line bg-paper-2 px-3 py-2 text-sm outline-none focus:border-orange";

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs font-semibold text-ink">{label}</span>
      {children}
    </label>
  );
}
