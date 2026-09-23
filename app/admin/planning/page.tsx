"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { adminAuthHeaders } from "@/lib/admin-auth";
import { DatePicker } from "@/components/ui/DatePicker";
import { PlanningSemaine } from "@/components/admin/PlanningSemaine";
import {
  planningActif,
  lundiDeLaSemaine,
  toISODate,
  jourLong,
  formatHeure,
  disciplineLabel,
  DISCIPLINES_COURS,
  JOURS,
  type Prof,
  type Cours,
  type Affectation,
  type PeriodeFermeture,
} from "@/lib/planning";

type Tab = "calendrier" | "profs" | "cours" | "fermetures";

const jsonHeaders = () => ({ "Content-Type": "application/json", ...adminAuthHeaders() });

const TYPE_LABEL: Record<string, string> = { adulte: "Adultes", jeune: "Jeunes" };

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
            <h2 className="font-display text-lg font-extrabold uppercase text-ink">
              Affecter un prof
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
              <span className="mb-1.5 block text-sm font-semibold text-ink">Prof</span>
              <select
                defaultValue={panneau.aff?.prof_id ?? ""}
                onChange={(e) => affecter(e.target.value || null)}
                className="focus-ring w-full rounded-xl border border-line bg-paper-2 px-4 py-3 text-sm outline-none focus:border-orange"
              >
                <option value="">— Aucun (retirer l&apos;affectation) —</option>
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
  const vide = { libelle: "", discipline: "", type_adherent: "", heure_debut: "18:00", heure_fin: "19:30", salle: "", ville: "" };
  const [form, setForm] = useState({ ...vide });
  const [jours, setJours] = useState<number[]>([1]); // création : multi-jours
  const [jourEdit, setJourEdit] = useState(1); // édition : un seul jour
  const [editId, setEditId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  function toggleJour(v: number) {
    setJours((s) => (s.includes(v) ? s.filter((x) => x !== v) : [...s, v].sort((a, b) => a - b)));
  }

  function editer(c: Cours) {
    setEditId(c.id);
    setJourEdit(c.jour_semaine ?? 1);
    setForm({
      libelle: c.libelle ?? "",
      discipline: c.discipline ?? "",
      type_adherent: c.type_adherent ?? "",
      heure_debut: formatHeure(c.heure_debut) || "18:00",
      heure_fin: formatHeure(c.heure_fin) || "19:30",
      salle: c.salle ?? "",
      ville: c.ville ?? "",
    });
  }
  function annuler() {
    setEditId(null);
    setForm({ ...vide });
    setJours([1]);
    setJourEdit(1);
  }

  const valide = form.libelle.trim() && form.discipline && form.type_adherent && (editId ? true : jours.length > 0);

  async function soumettre() {
    setBusy(true);
    try {
      const body = editId
        ? { id: editId, ...form, jour_semaine: jourEdit }
        : { ...form, jours };
      const res = await fetch("/api/admin/planning/cours", {
        method: editId ? "PATCH" : "POST",
        headers: jsonHeaders(),
        body: JSON.stringify(body),
      });
      const d = await res.json();
      if (!res.ok) {
        flash(d.error || "Échec de l'enregistrement.");
        return;
      }
      const n = d.crees ?? 1;
      flash(editId ? "Cours modifié ✓" : `${n} cours créé${n > 1 ? "s" : ""} ✓`);
      annuler();
      onChanged();
    } finally {
      setBusy(false);
    }
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

  async function supprimer(c: Cours) {
    if (!confirm("Supprimer ce cours ? Les affectations liées seront supprimées.")) return;
    const res = await fetch(`/api/admin/planning/cours/${c.id}`, {
      method: "DELETE",
      headers: adminAuthHeaders(),
    });
    if (res.ok) {
      flash("Cours supprimé");
      if (editId === c.id) annuler();
      onChanged();
    } else {
      flash("Échec de la suppression.");
    }
  }

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_1.2fr]">
      {/* Formulaire */}
      <div className="rounded-xl border border-line p-4">
        <h3 className="font-display text-base font-extrabold uppercase text-ink">
          {editId ? "Modifier le cours" : "Nouveau cours"}
        </h3>
        <div className="mt-3 space-y-3">
          <Field label="Libellé">
            <input
              value={form.libelle}
              onChange={(e) => setForm((f) => ({ ...f, libelle: e.target.value }))}
              placeholder="Ex. Boxe française — Adultes"
              className={inputCls}
            />
          </Field>

          {/* Jour(s) : multi-cases en création, sélecteur unique en édition */}
          {editId ? (
            <Field label="Jour">
              <select
                value={String(jourEdit)}
                onChange={(e) => setJourEdit(Number(e.target.value))}
                className={inputCls}
              >
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
                    <input
                      type="checkbox"
                      checked={jours.includes(j.valeur)}
                      onChange={() => toggleJour(j.valeur)}
                      className="sr-only"
                    />
                    {j.court}
                  </label>
                ))}
              </div>
            </Field>
          )}

          <div className="grid grid-cols-2 gap-3">
            <Field label="Début">
              <input
                type="time"
                value={form.heure_debut}
                onChange={(e) => setForm((f) => ({ ...f, heure_debut: e.target.value }))}
                className={inputCls}
              />
            </Field>
            <Field label="Fin">
              <input
                type="time"
                value={form.heure_fin}
                onChange={(e) => setForm((f) => ({ ...f, heure_fin: e.target.value }))}
                className={inputCls}
              />
            </Field>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Discipline">
              <select
                value={form.discipline}
                onChange={(e) => setForm((f) => ({ ...f, discipline: e.target.value }))}
                className={inputCls}
              >
                <option value="" disabled>
                  — Choisir —
                </option>
                {DISCIPLINES_COURS.map((d) => (
                  <option key={d.cle} value={d.cle}>
                    {d.label}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Public">
              <select
                value={form.type_adherent}
                onChange={(e) => setForm((f) => ({ ...f, type_adherent: e.target.value }))}
                className={inputCls}
              >
                <option value="" disabled>
                  — Choisir —
                </option>
                <option value="adulte">Adultes</option>
                <option value="jeune">Jeunes</option>
              </select>
            </Field>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Salle (option)">
              <input
                value={form.salle}
                onChange={(e) => setForm((f) => ({ ...f, salle: e.target.value }))}
                className={inputCls}
              />
            </Field>
            <Field label="Ville (option)">
              <input
                value={form.ville}
                onChange={(e) => setForm((f) => ({ ...f, ville: e.target.value }))}
                className={inputCls}
              />
            </Field>
          </div>
          <div className="flex gap-2">
            <button
              onClick={soumettre}
              disabled={busy || !valide}
              className="rounded-full bg-orange px-5 py-2.5 text-sm font-bold text-white hover:bg-orange-600 disabled:opacity-40"
            >
              {editId ? "Enregistrer" : jours.length > 1 ? `Ajouter (${jours.length} cours)` : "Ajouter"}
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

      {/* Liste */}
      <div>
        {cours.length === 0 ? (
          <p className="text-sm text-smoke">Aucun cours pour l&apos;instant.</p>
        ) : (
          <ul className="space-y-2">
            {cours.map((c) => (
              <li
                key={c.id}
                className={`flex items-center justify-between gap-3 rounded-xl border border-line p-3 ${
                  c.actif ? "bg-white" : "bg-paper-2 opacity-60"
                }`}
              >
                <div className="min-w-0">
                  <p className="truncate text-sm font-bold text-ink">{c.libelle}</p>
                  <p className="truncate text-xs text-smoke">
                    {jourLong(c.jour_semaine)} · {formatHeure(c.heure_debut)}–{formatHeure(c.heure_fin)}
                    {` · ${disciplineLabel(c.discipline)}`}
                    {c.type_adherent ? ` · ${TYPE_LABEL[c.type_adherent] ?? c.type_adherent}` : ""}
                    {c.salle ? ` · ${c.salle}` : ""}
                  </p>
                </div>
                <div className="flex shrink-0 gap-2">
                  <button
                    onClick={() => editer(c)}
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
                    onClick={() => supprimer(c)}
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
  const [libelle, setLibelle] = useState("");
  const [debut, setDebut] = useState("");
  const [fin, setFin] = useState("");
  const [busy, setBusy] = useState(false);

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
      setDebut("");
      setFin("");
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
          <DatePicker label="Début" value={debut} onChange={setDebut} />
          <DatePicker label="Fin" value={fin} onChange={setFin} />
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
  const horaire = `${formatHeure(cours.heure_debut)}–${formatHeure(cours.heure_fin)}`;
  const dateSemaine = new Date(semaineISO).toLocaleDateString("fr-FR", { dateStyle: "long" });
  const [objet, setObjet] = useState(`Cours ${cours.libelle ?? ""} — information`);
  const [contenu, setContenu] = useState(
    `Bonjour {{prenom}},\n\nLe cours ${cours.libelle ?? ""} du ${jourLong(cours.jour_semaine)} (${horaire}), semaine du ${dateSemaine}, est annulé / modifié.\n\nMerci de votre compréhension.\n\nSportivement,\nL'équipe`,
  );
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
                {cours.type_adherent ? ` · ${TYPE_LABEL[cours.type_adherent] ?? cours.type_adherent}` : ""}
              </p>
            </div>

            <div className="mt-3 rounded-xl bg-orange-50 p-3 text-sm font-semibold text-orange">
              {cible === null
                ? "Calcul de la cible…"
                : `${cible.count} adhérent${cible.count > 1 ? "s" : ""} concerné${cible.count > 1 ? "s" : ""} · ${cible.emails} email${cible.emails > 1 ? "s" : ""}`}
              <span className="mt-1 block text-xs font-normal text-smoke">
                Ciblage : {disciplineLabel(cours.discipline)}
                {cours.type_adherent ? ` · ${TYPE_LABEL[cours.type_adherent] ?? cours.type_adherent}` : " · tous publics"}
                {" "}· adhérents actifs de la saison en cours (désinscrits et adresses invalides exclus à l&apos;envoi).
              </span>
            </div>

            <label className="mt-4 block">
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
