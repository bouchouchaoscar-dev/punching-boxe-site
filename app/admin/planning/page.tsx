"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { adminAuthHeaders } from "@/lib/admin-auth";
import { DatePicker } from "@/components/ui/DatePicker";
import { PlanningSemaine } from "@/components/admin/PlanningSemaine";
import {
  planningActif,
  lundiDeLaSemaine,
  toISODate,
  dateDuJour,
  jourLong,
  formatHeure,
  disciplineLabel,
  publicLabel,
  couleurCours,
  DISCIPLINES_COURS,
  JOURS,
  type Prof,
  type Cours,
  type Affectation,
  type PeriodeFermeture,
} from "@/lib/planning";

type Tab = "calendrier" | "profs" | "cours" | "fermetures";

const jsonHeaders = () => ({ "Content-Type": "application/json", ...adminAuthHeaders() });

export default function PlanningPage() {
  const actif = planningActif();
  const [tab, setTab] = useState<Tab>("calendrier");
  const [profs, setProfs] = useState<Prof[]>([]);
  const [cours, setCours] = useState<Cours[]>([]);
  const [periodes, setPeriodes] = useState<PeriodeFermeture[]>([]);
  const [semaineISO, setSemaineISO] = useState(() => toISODate(lundiDeLaSemaine(new Date())));
  const [affectations, setAffectations] = useState<Affectation[]>([]);
  const [toast, setToast] = useState<string | null>(null);

  // Cours sélectionné dans le calendrier → panneau d'affectation.
  const [panneau, setPanneau] = useState<{ cours: Cours; aff: Affectation | null } | null>(null);
  // Cours pour lequel on prévient les adhérents (mailing ciblé par discipline).
  const [prevenir, setPrevenir] = useState<Cours | null>(null);
  // Affectation en attente de confirmation (avant écriture + mail au prof).
  const [confirmAff, setConfirmAff] = useState<{ profId: string | null } | null>(null);

  const flash = useCallback((m: string) => {
    setToast(m);
    window.setTimeout(() => setToast(null), 3200);
  }, []);

  const chargerBase = useCallback(() => {
    if (!actif) return;
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
  }, [actif]);

  const chargerAffectations = useCallback(() => {
    if (!actif) return;
    fetch(`/api/admin/planning/affectations?semaine=${semaineISO}`, {
      headers: adminAuthHeaders(),
      cache: "no-store",
    })
      .then((r) => r.json())
      .then((d) => setAffectations(d.affectations ?? []))
      .catch(() => {});
  }, [actif, semaineISO]);

  useEffect(() => chargerBase(), [chargerBase]);
  useEffect(() => chargerAffectations(), [chargerAffectations]);

  const profsActifs = useMemo(() => profs.filter((p) => p.actif), [profs]);
  const coursActifs = useMemo(() => cours.filter((c) => c.actif), [cours]);

  function decalerSemaine(deltaJours: number) {
    const [y, m, d] = semaineISO.split("-").map(Number);
    const base = new Date(y, m - 1, d);
    base.setDate(base.getDate() + deltaJours);
    setSemaineISO(toISODate(lundiDeLaSemaine(base)));
  }

  // ---- Affectation d'un prof à un cours pour la semaine affichée ----
  async function affecter(profId: string | null) {
    if (!panneau) return;
    const res = await fetch("/api/admin/planning/affectations", {
      method: "POST",
      headers: jsonHeaders(),
      body: JSON.stringify({ cours_id: panneau.cours.id, prof_id: profId, semaine: semaineISO }),
    });
    const d = await res.json();
    if (!res.ok) {
      flash(d.error || "Échec de l'affectation.");
      return;
    }
    const map: Record<string, string> = {
      envoye: "Prof affecté · mail envoyé ✓",
      sans_email: "Prof affecté (pas d'email → aucun mail)",
      erreur: "Prof affecté, mais l'envoi du mail a échoué",
      aucun_prof: "Affectation retirée",
    };
    flash(map[d.mail as string] ?? "Affectation enregistrée");
    setPanneau(null);
    chargerAffectations();
  }

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
          <PlanningSemaine
            semaineISO={semaineISO}
            cours={coursActifs}
            affectations={affectations}
            profs={profs}
            periodes={periodes}
            onPrev={() => decalerSemaine(-7)}
            onNext={() => decalerSemaine(7)}
            onToday={() => setSemaineISO(toISODate(lundiDeLaSemaine(new Date())))}
            onSelectCours={(c, aff, _iso, ferme) => {
              if (ferme) {
                flash(`Fermé (${ferme.libelle || "vacances"}) — pas d'affectation.`);
                return;
              }
              setPanneau({ cours: c, aff });
            }}
          />
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

      {/* Panneau d'affectation */}
      {panneau && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink/40 p-4">
          <div className="w-full max-w-md rounded-[1.5rem] bg-white p-6">
            <h2 className="text-center font-display text-lg font-extrabold uppercase text-ink">
              Ce cours
            </h2>
            <div className="mt-3 rounded-xl border border-line bg-paper-2 p-3 text-sm">
              <p className="font-bold text-ink">{panneau.cours.libelle}</p>
              <p className="text-smoke">
                {jourLong(panneau.cours.jour_semaine)} · {formatHeure(panneau.cours.heure_debut)}–
                {formatHeure(panneau.cours.heure_fin)}
                {panneau.cours.salle ? ` · ${panneau.cours.salle}` : ""}
              </p>
              <p className="mt-1 text-xs text-smoke">
                Semaine du{" "}
                {new Date(semaineISO).toLocaleDateString("fr-FR", { dateStyle: "long" })}
              </p>
            </div>

            <label className="mt-4 block">
              <span className="mb-1.5 block text-sm font-semibold text-ink">
                Affecter un professeur
              </span>
              <select
                value={panneau.aff?.prof_id ?? ""}
                onChange={(e) => setConfirmAff({ profId: e.target.value || null })}
                className="focus-ring w-full rounded-xl border border-line bg-paper-2 px-4 py-3 text-sm outline-none focus:border-orange"
              >
                <option value="">
                  {panneau.aff?.prof_id
                    ? "Retirer l'affectation"
                    : "— Sélectionner un professeur —"}
                </option>
                {profsActifs.map((p) => (
                  <option key={p.id} value={p.id}>
                    {[p.prenom, p.nom].filter(Boolean).join(" ")}
                    {!p.email ? " (sans email)" : ""}
                  </option>
                ))}
              </select>
            </label>
            {profsActifs.length === 0 && (
              <p className="mt-2 text-xs text-smoke">
                Aucun prof actif. Ajoutez-en un dans l&apos;onglet « Profs ».
              </p>
            )}
            <p className="mt-2 text-xs text-smoke">
              Choisir un prof enregistre l&apos;affectation et lui envoie un email (s&apos;il en a un).
            </p>

            <button
              onClick={() => {
                const c = panneau.cours;
                setPanneau(null);
                setPrevenir(c);
              }}
              className="mt-4 flex w-full items-center justify-center gap-2 rounded-full bg-ink px-5 py-2.5 text-sm font-bold text-white hover:bg-orange"
            >
              ✉️ Prévenir les adhérents de ce cours
            </button>
            <button
              onClick={() => setPanneau(null)}
              className="mt-2 w-full rounded-full border border-line px-5 py-2.5 text-sm font-semibold text-ink"
            >
              Fermer
            </button>
          </div>
        </div>
      )}

      {prevenir && (
        <PrevenirPanel
          cours={prevenir}
          semaineISO={semaineISO}
          onClose={() => setPrevenir(null)}
          flash={flash}
        />
      )}

      {/* Confirmation avant affectation / retrait (l'affectation envoie un mail) */}
      {confirmAff && panneau && (() => {
        const profId = confirmAff.profId;
        const prof = profId ? profs.find((p) => p.id === profId) : null;
        const nomProf = prof ? [prof.prenom, prof.nom].filter(Boolean).join(" ") : "";
        const c = panneau.cours;
        const coursInfo = `${c.libelle} du ${jourLong(c.jour_semaine)} ${formatHeure(c.heure_debut)}–${formatHeure(c.heure_fin)}`;
        const ancienProf = panneau.aff?.prof_id ? profs.find((p) => p.id === panneau.aff!.prof_id) : null;
        const ancienNom = ancienProf ? [ancienProf.prenom, ancienProf.nom].filter(Boolean).join(" ") : "ce professeur";
        const message =
          profId === null
            ? `Retirer ${ancienNom} du cours ${coursInfo} ? Aucun email ne sera envoyé.`
            : prof?.email
              ? `Affecter ${nomProf} au cours ${coursInfo} ? Un email de confirmation lui sera envoyé.`
              : `Affecter ${nomProf} au cours ${coursInfo} ? Aucun email ne sera envoyé, ce professeur n'a pas d'adresse renseignée.`;
        return (
          <div className="fixed inset-0 z-[65] flex items-center justify-center bg-ink/40 p-4">
            <div className="w-full max-w-sm rounded-[1.5rem] bg-white p-6 text-center">
              <h2 className="font-display text-lg font-extrabold uppercase text-ink">
                {profId === null ? "Retirer le professeur" : "Confirmer l'affectation"}
              </h2>
              <p className="mt-3 text-sm text-smoke">{message}</p>
              <div className="mt-5 flex justify-center gap-3">
                <button
                  onClick={() => setConfirmAff(null)}
                  className="rounded-full border border-line px-5 py-2.5 text-sm font-semibold text-ink"
                >
                  Annuler
                </button>
                <button
                  onClick={() => {
                    affecter(profId);
                    setConfirmAff(null);
                  }}
                  className="rounded-full bg-orange px-5 py-2.5 text-sm font-bold text-white hover:bg-orange-600"
                >
                  {profId === null ? "Retirer" : "Affecter"}
                </button>
              </div>
            </div>
          </div>
        );
      })()}

      {toast && (
        <div className="fixed bottom-6 right-6 z-[60] max-w-xs rounded-xl bg-ink px-5 py-3 text-sm font-bold text-white shadow-lg">
          {toast}
        </div>
      )}
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
    useState<{ type: "desactiver" | "supprimer"; groupe: Groupe } | null>(null);
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
    if (!confirm("Supprimer ce créneau ? Les affectations liées seront supprimées.")) return;
    const res = await fetch(`/api/admin/planning/cours/${c.id}`, {
      method: "DELETE",
      headers: adminAuthHeaders(),
    });
    if (res.ok) {
      flash("Créneau supprimé");
      onChanged();
    } else {
      flash("Échec de la suppression.");
    }
  }

  // Actions de GROUPE (tous les créneaux d'un groupe), après confirmation.
  async function executerGroupe() {
    if (!groupeAction) return;
    setBusyGroupe(true);
    try {
      const { type, groupe } = groupeAction;
      for (const c of groupe.creneaux) {
        if (type === "supprimer") {
          await fetch(`/api/admin/planning/cours/${c.id}`, {
            method: "DELETE",
            headers: adminAuthHeaders(),
          });
        } else {
          await fetch("/api/admin/planning/cours", {
            method: "PATCH",
            headers: jsonHeaders(),
            body: JSON.stringify({ id: c.id, actif: false }),
          });
        }
      }
      flash(type === "supprimer" ? "Groupe supprimé" : "Groupe désactivé");
      setGroupeAction(null);
      onChanged();
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
              {groupeAction.type === "supprimer" ? "Supprimer le cours" : "Désactiver le cours"}
            </h2>
            <p className="mt-3 text-sm text-smoke">
              {groupeAction.type === "supprimer" ? (
                <>
                  Supprimer les <strong>{groupeAction.groupe.creneaux.length}</strong> créneau
                  {groupeAction.groupe.creneaux.length > 1 ? "x" : ""} de{" "}
                  <strong className="text-ink">{groupeAction.groupe.libelle}</strong> ? Les affectations
                  liées (toutes semaines) seront supprimées. Action irréversible.
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
                Annuler
              </button>
              <button
                onClick={executerGroupe}
                disabled={busyGroupe}
                className={`rounded-full px-5 py-2.5 text-sm font-bold text-white disabled:opacity-50 ${
                  groupeAction.type === "supprimer" ? "bg-red-600 hover:bg-red-700" : "bg-orange hover:bg-orange-600"
                }`}
              >
                {busyGroupe ? "…" : groupeAction.type === "supprimer" ? "Tout supprimer" : "Tout désactiver"}
              </button>
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
  const [form, setForm] = useState({ ...vide });
  const [editId, setEditId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

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

  async function basculerActif(p: Prof) {
    const res = await fetch("/api/admin/planning/profs", {
      method: "PATCH",
      headers: jsonHeaders(),
      body: JSON.stringify({ id: p.id, actif: !p.actif }),
    });
    if (res.ok) {
      flash(p.actif ? "Prof désactivé" : "Prof réactivé");
      onChanged();
    }
  }

  async function supprimer(p: Prof) {
    const nom = [p.prenom, p.nom].filter(Boolean).join(" ") || "ce prof";
    if (!confirm(`Supprimer ${nom} ? Ses affectations passées resteront (sans prof).`)) return;
    const res = await fetch(`/api/admin/planning/profs/${p.id}`, {
      method: "DELETE",
      headers: adminAuthHeaders(),
    });
    if (res.ok) {
      flash("Prof supprimé");
      if (editId === p.id) annuler();
      onChanged();
    } else {
      flash("Échec de la suppression.");
    }
  }

  return (
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
        {profs.length === 0 ? (
          <p className="text-sm text-smoke">Aucun prof pour l&apos;instant.</p>
        ) : (
          <ul className="space-y-2">
            {profs.map((p) => (
              <li
                key={p.id}
                className={`flex items-center justify-between gap-3 rounded-xl border border-line p-3 ${
                  p.actif ? "bg-white" : "bg-paper-2 opacity-60"
                }`}
              >
                <div className="min-w-0">
                  <p className="truncate text-sm font-bold text-ink">
                    {[p.prenom, p.nom].filter(Boolean).join(" ") || "—"}
                  </p>
                  <p className="truncate text-xs text-smoke">
                    {p.email || "sans email"}
                    {p.telephone ? ` · ${p.telephone}` : ""}
                  </p>
                </div>
                <div className="flex shrink-0 gap-2">
                  <button
                    onClick={() => editer(p)}
                    className="text-xs font-semibold text-orange hover:underline"
                  >
                    Modifier
                  </button>
                  <button
                    onClick={() => basculerActif(p)}
                    className="text-xs font-semibold text-smoke hover:text-ink"
                  >
                    {p.actif ? "Désactiver" : "Réactiver"}
                  </button>
                  <button
                    onClick={() => supprimer(p)}
                    className="text-xs font-semibold text-red-600 hover:underline"
                  >
                    Supprimer
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
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
  onClose,
  flash,
}: {
  cours: Cours;
  semaineISO: string;
  onClose: () => void;
  flash: (m: string) => void;
}) {
  const libelle = cours.libelle ?? "ce cours";
  const jour = jourLong(cours.jour_semaine);
  const horaire = `${formatHeure(cours.heure_debut)}–${formatHeure(cours.heure_fin)}`;
  const dateSemaine = new Date(semaineISO).toLocaleDateString("fr-FR", { dateStyle: "long" });

  // Date de l'occurrence concernée (jour du cours dans la semaine affichée).
  const dateOcc = dateDuJour(semaineISO, cours.jour_semaine ?? 1);
  const dateOccCourt = dateOcc.toLocaleDateString("fr-FR", {
    day: "2-digit",
    month: "2-digit",
    year: "2-digit",
  });

  type Motif = "annule" | "deplace" | "reporte";
  const MOTIF_LABEL: Record<Motif, string> = { annule: "Annulé", deplace: "Déplacé", reporte: "Reporté" };
  const [etape, setEtape] = useState<"motif" | "compose">("motif");
  const [motif, setMotif] = useState<Motif | null>(null);
  const [raison, setRaison] = useState(""); // annulé (optionnel)
  const [depHeure, setDepHeure] = useState(formatHeure(cours.heure_debut) || "18:00"); // déplacé (oblig)
  const [depSalle, setDepSalle] = useState(""); // déplacé (optionnel)
  const [nvDate, setNvDate] = useState(""); // reporté (ISO)
  const [nvHeure, setNvHeure] = useState(formatHeure(cours.heure_debut) || "18:00"); // reporté

  const [objet, setObjet] = useState("");
  const [contenu, setContenu] = useState("");
  const [cible, setCible] = useState<{ count: number; emails: number } | null>(null);
  const [confirm, setConfirm] = useState(false);
  const [sending, setSending] = useState(false);
  const [resultat, setResultat] = useState<{ emails: number; personnes: number } | null>(null);

  // Comptage de la cible dès l'ouverture (preview, aucun envoi).
  useEffect(() => {
    fetch(`/api/admin/planning/cours/${cours.id}/prevenir`, {
      method: "POST",
      headers: jsonHeaders(),
      body: JSON.stringify({ preview: true }),
    })
      .then((r) => r.json())
      .then((d) => setCible({ count: d.count ?? 0, emails: d.emails ?? 0 }))
      .catch(() => setCible({ count: 0, emails: 0 }));
  }, [cours.id]);

  // Gabarit de mail auto-généré selon le motif (base ÉDITABLE ensuite).
  // Objet enrichi : "📅 Cours [libellé] — [Jour] [JJ/MM/AA] — [Motif]".
  // Corps : "Le cours [libellé]…" (libellé tel quel, aucune redondance).
  function genererMail(m: Motif): { objet: string; contenu: string } {
    let phrase = "";
    if (m === "annule") {
      phrase = `Le cours ${libelle} du ${jour} ${horaire}, semaine du ${dateSemaine}, est annulé${
        raison.trim() ? ` pour raison : ${raison.trim()}` : ""
      }. Merci de votre compréhension.`;
    } else if (m === "deplace") {
      phrase = depSalle.trim()
        ? `Le cours ${libelle} du ${jour} est déplacé à ${depHeure}, en salle ${depSalle.trim()}.`
        : `Le cours ${libelle} du ${jour} est déplacé à ${depHeure}.`;
    } else {
      const dFr = nvDate ? new Date(nvDate).toLocaleDateString("fr-FR", { dateStyle: "long" }) : "…";
      phrase = `Le cours ${libelle} initialement prévu le ${jour} ${horaire} est reporté au ${dFr} à ${nvHeure}.`;
    }
    return {
      objet: `📅 Cours ${libelle} — ${jour} ${dateOccCourt} — ${MOTIF_LABEL[m]}`,
      contenu: `Bonjour {{prenom}},\n\n${phrase}\n\nSportivement,\nL'équipe`,
    };
  }

  const motifValide =
    motif === "annule" ||
    (motif === "deplace" && depHeure.length > 0) ||
    (motif === "reporte" && !!nvDate && !!nvHeure);

  function continuer() {
    if (!motif || !motifValide) return;
    const m = genererMail(motif);
    setObjet(m.objet);
    setContenu(m.contenu);
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
        body: JSON.stringify({ objet, contenu }),
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
                {jourLong(cours.jour_semaine)} · {horaire} · {disciplineLabel(cours.discipline)}
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
                {motif === "deplace" && (
                  <div className="mt-4 grid gap-3 sm:grid-cols-2">
                    <label className="block">
                      <span className="mb-1.5 block text-sm font-semibold text-ink">Nouvelle heure</span>
                      <input
                        type="time"
                        value={depHeure}
                        onChange={(e) => setDepHeure(e.target.value)}
                        className={inputCls}
                      />
                    </label>
                    <label className="block">
                      <span className="mb-1.5 block text-sm font-semibold text-ink">Nouvelle salle (optionnel)</span>
                      <input
                        value={depSalle}
                        onChange={(e) => setDepSalle(e.target.value)}
                        placeholder="Ex. Gymnase des Ormes"
                        className={inputCls}
                      />
                    </label>
                  </div>
                )}
                {motif === "reporte" && (
                  <div className="mt-4 grid gap-3 sm:grid-cols-2">
                    <DatePicker label="Nouvelle date" value={nvDate} onChange={setNvDate} />
                    <label className="block">
                      <span className="mb-1.5 block text-sm font-semibold text-ink">Nouvelle heure</span>
                      <input
                        type="time"
                        value={nvHeure}
                        onChange={(e) => setNvHeure(e.target.value)}
                        className={inputCls}
                      />
                    </label>
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
                onChange={(e) => setContenu(e.target.value)}
                rows={9}
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
