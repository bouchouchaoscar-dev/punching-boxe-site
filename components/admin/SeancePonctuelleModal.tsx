"use client";

import { useState } from "react";
import { adminAuthHeaders } from "@/lib/admin-auth";
import { DatePicker } from "@/components/ui/DatePicker";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { DISCIPLINES_COURS, formatHeure, type Cours } from "@/lib/planning";

const jsonHeaders = () => ({ "Content-Type": "application/json", ...adminAuthHeaders() });
const inputCls =
  "focus-ring w-full rounded-lg border border-line bg-paper-2 px-3 py-2 text-sm outline-none focus:border-orange";

// [024] Séance PONCTUELLE (stage, rattrapage, événement) : un cours à une date
// précise (date_unique). Mêmes listes que les cours récurrents (discipline, public,
// salle/ville libres). Autorisée même pendant une fermeture. Création / édition /
// suppression (suppression bloquée si des présences sont enregistrées, 409).
export function SeancePonctuelleModal({
  mode,
  cours,
  dateInitiale,
  onClose,
  onDone,
}: {
  mode: "create" | "edit";
  cours?: Cours;
  dateInitiale?: string; // date pré-remplie en création (ISO)
  onClose: () => void;
  onDone: (msg: string) => void;
}) {
  const edit = mode === "edit";
  const [form, setForm] = useState({
    libelle: cours?.libelle ?? "",
    discipline: cours?.discipline ?? "",
    type_adherent: edit ? cours?.type_adherent ?? "tous" : "",
    date: cours?.date_unique ?? dateInitiale ?? "",
    heure_debut: formatHeure(cours?.heure_debut ?? null) || "18:00",
    heure_fin: formatHeure(cours?.heure_fin ?? null) || "19:30",
    salle: cours?.salle ?? "",
    ville: cours?.ville ?? "",
  });
  const [busy, setBusy] = useState(false);
  const [erreur, setErreur] = useState("");
  const [confirmSuppr, setConfirmSuppr] = useState(false);

  const maj = (patch: Partial<typeof form>) => setForm((f) => ({ ...f, ...patch }));

  const valide =
    form.libelle.trim() &&
    form.discipline &&
    form.type_adherent &&
    /^\d{4}-\d{2}-\d{2}$/.test(form.date) &&
    form.heure_fin > form.heure_debut;

  async function soumettre() {
    setBusy(true);
    setErreur("");
    try {
      const body = {
        ...(edit ? { id: cours!.id } : {}),
        libelle: form.libelle.trim(),
        discipline: form.discipline,
        type_adherent: form.type_adherent,
        date_unique: form.date,
        heure_debut: form.heure_debut,
        heure_fin: form.heure_fin,
        salle: form.salle.trim(),
        ville: form.ville.trim(),
      };
      const res = await fetch("/api/admin/planning/cours", {
        method: edit ? "PATCH" : "POST",
        headers: jsonHeaders(),
        body: JSON.stringify(body),
      });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) {
        setErreur(d.error || "Échec de l'enregistrement.");
        return;
      }
      onDone(edit ? "Séance ponctuelle modifiée ✓" : "Séance ponctuelle ajoutée ✓");
    } finally {
      setBusy(false);
    }
  }

  async function supprimer() {
    setBusy(true);
    try {
      const res = await fetch(`/api/admin/planning/cours/${cours!.id}`, {
        method: "DELETE",
        headers: adminAuthHeaders(),
      });
      if (res.ok) {
        onDone("Séance ponctuelle supprimée");
        return;
      }
      const d = await res.json().catch(() => ({}));
      setConfirmSuppr(false);
      // Garde-fou présences / historique (même règle que les cours récurrents) :
      // message visible inline (409 = présences enregistrées → désactiver plutôt).
      setErreur(d.error || "Échec de la suppression.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="fixed inset-0 z-[65] flex items-stretch justify-center bg-ink/40 sm:items-center sm:p-4" onClick={onClose}>
      <div
        onClick={(e) => e.stopPropagation()}
        className="relative flex h-full w-full flex-col overflow-y-auto bg-white p-5 sm:h-auto sm:max-h-[90vh] sm:w-[560px] sm:rounded-[1.5rem] sm:p-6"
      >
        <button
          onClick={onClose}
          aria-label="Fermer"
          className="absolute right-4 top-4 flex h-8 w-8 items-center justify-center rounded-full text-xl text-smoke hover:bg-paper-2 hover:text-ink"
        >
          ×
        </button>
        <h2 className="font-display text-xl font-extrabold uppercase text-ink">
          {edit ? "Modifier la séance ponctuelle" : "Ajouter une séance ponctuelle"}
        </h2>
        <p className="mt-1 text-sm text-smoke">
          Stage, rattrapage ou événement à une date précise. Autorisée même pendant une période de fermeture.
        </p>

        <div className="mt-4 space-y-3">
          <Field label="Libellé">
            <input value={form.libelle} onChange={(e) => maj({ libelle: e.target.value })} placeholder="Ex. Stage de boxe" className={inputCls} />
          </Field>
          <DatePicker label="Date de la séance" value={form.date} onChange={(v) => maj({ date: v })} />
          <div className="grid grid-cols-2 gap-3">
            <Field label="Début">
              <input type="time" value={form.heure_debut} onChange={(e) => maj({ heure_debut: e.target.value })} className={inputCls} />
            </Field>
            <Field label="Fin">
              <input type="time" value={form.heure_fin} onChange={(e) => maj({ heure_fin: e.target.value })} className={inputCls} />
            </Field>
          </div>
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
          {erreur && <p className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm font-semibold text-red-700">{erreur}</p>}
        </div>

        <div className="mt-6 flex items-center justify-between gap-2">
          {edit ? (
            <button onClick={() => setConfirmSuppr(true)} disabled={busy} className="rounded-full border border-red-200 bg-white px-4 py-2.5 text-sm font-semibold text-red-600 hover:border-red-400 disabled:opacity-50">
              Supprimer
            </button>
          ) : <span />}
          <div className="flex gap-2">
            <button onClick={onClose} className="rounded-full border border-line px-5 py-2.5 text-sm font-semibold text-ink">Annuler</button>
            <button onClick={soumettre} disabled={busy || !valide} className="rounded-full bg-orange px-5 py-2.5 text-sm font-bold text-white hover:bg-orange-600 disabled:opacity-40">
              {busy ? "…" : edit ? "Enregistrer" : "Ajouter"}
            </button>
          </div>
        </div>
      </div>

      {confirmSuppr && (
        <ConfirmDialog
          title="Supprimer la séance"
          message={<p className="text-sm">Supprimer cette séance ponctuelle ? Les affectations de prof liées seront retirées. (Bloqué si des présences ont déjà été enregistrées.)</p>}
          variant="danger"
          confirmLabel={busy ? "Suppression…" : "Supprimer"}
          busy={busy}
          onConfirm={supprimer}
          onCancel={() => !busy && setConfirmSuppr(false)}
        />
      )}
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs font-semibold text-ink">{label}</span>
      {children}
    </label>
  );
}
