"use client";

import { useMemo, useState } from "react";
import { adminAuthHeaders } from "@/lib/admin-auth";
import { euro, formuleLabel, TARIFS, type PackageType } from "@/lib/pricing";
import { DatePicker } from "@/components/ui/DatePicker";

// Formules RÉELLES (mêmes qu'à l'inscription) : package + option prépa.
// L'option prépa ne qualifie que la Boxe Française (pas un 3e package).
const FORMULES = [
  { id: "boxe", package: "boxe_classique" as PackageType, prepa: false },
  { id: "boxe_prepa", package: "boxe_classique" as PackageType, prepa: true },
  { id: "savate", package: "savate_prepa" as PackageType, prepa: false },
] as const;
type FormuleId = (typeof FORMULES)[number]["id"];

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
// Hauteur EXPLICITE (h-11) : un <select> natif rend plus court qu'un <input>
// avec un simple padding vertical → une hauteur fixe garantit des champs
// identiques (input + select) et alignés, cohérents avec les DatePicker.
const champCls =
  "focus-ring mt-1 h-11 w-full rounded-xl border border-line bg-white px-3 text-sm outline-none focus:border-orange";

// Dates par défaut : début = aujourd'hui, fin = +1 mois.
const pad = (n: number) => String(n).padStart(2, "0");
const toISO = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const plusUnMois = (iso: string) => {
  const [y, m, d] = iso.split("-").map(Number);
  if (!y || !m || !d) return iso;
  const dt = new Date(y, m - 1, d);
  dt.setMonth(dt.getMonth() + 1);
  return toISO(dt);
};

// Modale ADMIN : création d'un dossier à TARIF LIBRE + DURÉE LIBRE. La validation
// serveur (POST /api/admin/adherents/creer) reste autoritaire ; ici on valide
// aussi côté client pour un retour immédiat.
export function CreerAdherentModal({
  onClose,
  onCreated,
}: {
  onClose: () => void;
  onCreated: (email: string) => void;
}) {
  const [nom, setNom] = useState("");
  const [prenom, setPrenom] = useState("");
  const [email, setEmail] = useState("");
  const [formuleId, setFormuleId] = useState<FormuleId>("boxe");
  const [nouveauMembre, setNouveauMembre] = useState(false);
  const [cotisation, setCotisation] = useState("");
  // Défauts intelligents : début = aujourd'hui, fin = +1 mois (recalculée tant
  // que l'admin n'a pas fixé une fin à la main).
  const [dateDebut, setDateDebut] = useState(() => toISO(new Date()));
  const [dateFin, setDateFin] = useState(() => plusUnMois(toISO(new Date())));
  const [finManuelle, setFinManuelle] = useState(false);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  // Date de début → recalcule la fin (+1 mois) tant qu'elle n'est pas manuelle.
  function onDateDebut(v: string) {
    setDateDebut(v);
    if (!finManuelle && v) setDateFin(plusUnMois(v));
  }
  function onDateFin(v: string) {
    setDateFin(v);
    setFinManuelle(true);
  }

  const cotisationNum = Number(cotisation.replace(",", "."));
  const total = useMemo(
    () =>
      (Number.isFinite(cotisationNum) && cotisationNum > 0 ? cotisationNum : 0) +
      (nouveauMembre ? TARIFS.adhesion : 0),
    [cotisationNum, nouveauMembre],
  );

  async function submit() {
    setError("");
    // Validation client (le serveur revalide, autoritaire).
    if (!nom.trim() || !prenom.trim()) return setError("Nom et prénom requis.");
    if (!EMAIL_RE.test(email.trim())) return setError("Email invalide.");
    if (!Number.isFinite(cotisationNum) || cotisationNum <= 0)
      return setError("Montant de cotisation invalide.");
    if (!dateDebut || !dateFin) return setError("Dates de début et de fin requises.");
    if (Date.parse(dateFin) <= Date.parse(dateDebut))
      return setError("La date de fin doit être après la date de début.");

    const formule = FORMULES.find((f) => f.id === formuleId) ?? FORMULES[0];

    setBusy(true);
    try {
      const res = await fetch("/api/admin/adherents/creer", {
        method: "POST",
        headers: { ...adminAuthHeaders(), "Content-Type": "application/json" },
        body: JSON.stringify({
          nom: nom.trim(),
          prenom: prenom.trim(),
          email: email.trim(),
          package: formule.package,
          option_prepa_physique: formule.prepa,
          nouveau_membre: nouveauMembre,
          cotisation_libre: cotisationNum,
          date_debut: dateDebut,
          date_fin: dateFin,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok && data.success) {
        onCreated(email.trim());
        onClose();
      } else {
        setError(data.error || "Création impossible.");
      }
    } catch {
      setError("Erreur réseau.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink/40 p-4">
      <div className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-[1.5rem] bg-white p-6">
        <h2 className="font-display text-xl font-extrabold uppercase text-ink">
          Créer un adhérent
        </h2>
        <p className="mt-1 text-sm text-smoke">
          Dossier à tarif et durée libres. Un mail d&apos;activation sera envoyé
          à l&apos;adhérent pour qu&apos;il complète et paie son dossier.
        </p>

        <div className="mt-5 grid gap-4 sm:grid-cols-2">
          <label className="block">
            <span className="text-xs font-bold uppercase tracking-wide text-smoke">
              Prénom
            </span>
            <input value={prenom} onChange={(e) => setPrenom(e.target.value)} className={champCls} />
          </label>
          <label className="block">
            <span className="text-xs font-bold uppercase tracking-wide text-smoke">
              Nom
            </span>
            <input value={nom} onChange={(e) => setNom(e.target.value)} className={champCls} />
          </label>
          <label className="block sm:col-span-2">
            <span className="text-xs font-bold uppercase tracking-wide text-smoke">
              Email
            </span>
            <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} className={champCls} />
          </label>
          <label className="block">
            <span className="text-xs font-bold uppercase tracking-wide text-smoke">
              Formule
            </span>
            <select
              value={formuleId}
              onChange={(e) => setFormuleId(e.target.value as FormuleId)}
              className={champCls}
            >
              {FORMULES.map((f) => (
                <option key={f.id} value={f.id}>
                  {formuleLabel(f.package, f.prepa)}
                </option>
              ))}
            </select>
          </label>
          <label className="block">
            <span className="text-xs font-bold uppercase tracking-wide text-smoke">
              Cotisation (€)
            </span>
            <input
              type="number"
              min="0"
              step="1"
              inputMode="decimal"
              value={cotisation}
              onChange={(e) => setCotisation(e.target.value)}
              className={champCls}
            />
          </label>
          {/* Adhésion : ligne pleine largeur (bien ancrée, plus flottante). */}
          <label className="flex cursor-pointer items-center gap-2.5 rounded-xl border border-line bg-paper-2 px-3 py-2.5 sm:col-span-2">
            <input
              type="checkbox"
              checked={nouveauMembre}
              onChange={(e) => setNouveauMembre(e.target.checked)}
              className="h-4 w-4 accent-orange"
            />
            <span className="text-sm font-semibold text-ink">
              Frais d&apos;adhésion (30 €)
            </span>
          </label>
          {/* Dates : paire alignée sur une ligne (2 colonnes). */}
          <DatePicker
            label="Date de début"
            required
            value={dateDebut}
            onChange={onDateDebut}
          />
          <DatePicker
            label="Date de fin"
            required
            value={dateFin}
            onChange={onDateFin}
          />
        </div>

        {/* Récap du montant total qui sera facturé. */}
        <div className="mt-5 rounded-xl bg-paper-2 p-4 text-sm">
          <div className="flex items-center justify-between">
            <span className="text-smoke">Cotisation</span>
            <span className="font-semibold text-ink">
              {euro(cotisationNum > 0 ? cotisationNum : 0)}
            </span>
          </div>
          {nouveauMembre && (
            <div className="mt-1 flex items-center justify-between">
              <span className="text-smoke">Frais d&apos;adhésion</span>
              <span className="font-semibold text-ink">{euro(TARIFS.adhesion)}</span>
            </div>
          )}
          <div className="mt-2 flex items-center justify-between border-t border-line pt-2">
            <span className="font-bold text-ink">Total à régler</span>
            <span className="font-display text-lg font-black text-orange">
              {euro(total)}
            </span>
          </div>
        </div>

        {error && (
          <p className="mt-4 rounded-xl bg-red-50 p-3 text-sm font-semibold text-red-700">
            {error}
          </p>
        )}

        <div className="mt-5 flex justify-end gap-3">
          <button
            onClick={onClose}
            disabled={busy}
            className="rounded-full border border-line px-5 py-2.5 text-sm font-semibold text-ink"
          >
            Annuler
          </button>
          <button
            onClick={submit}
            disabled={busy}
            className="rounded-full bg-orange px-5 py-2.5 text-sm font-bold text-white transition-colors hover:brightness-95 disabled:opacity-50"
          >
            {busy ? "Création…" : "Créer le dossier"}
          </button>
        </div>
      </div>
    </div>
  );
}
