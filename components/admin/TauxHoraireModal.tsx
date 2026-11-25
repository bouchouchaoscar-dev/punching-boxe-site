"use client";

import { useCallback, useEffect, useState } from "react";
import { adminAuthHeaders } from "@/lib/admin-auth";
import { DatePicker } from "@/components/ui/DatePicker";
import { formatMontant, toISODate, type Prof } from "@/lib/planning";

const jsonHeaders = () => ({ "Content-Type": "application/json", ...adminAuthHeaders() });
const inputCls = "focus-ring w-full rounded-lg border border-line bg-paper-2 px-3 py-2 text-sm outline-none focus:border-orange";

type Taux = { id: string; montant_horaire: number; date_effet: string };
const frDate = (iso: string) => { const [y, m, d] = iso.split("-"); return `${d}/${m}/${y}`; };

// [024] Taux horaire d'un prof avec historique à date d'effet. Le taux d'une séance
// est celui en vigueur à sa date ; on AJOUTE un nouveau taux sans écraser l'ancien.
// Données STRICTEMENT admin (jamais côté coach).
export function TauxHoraireModal({ prof, onClose, flash }: { prof: Prof; onClose: () => void; flash: (m: string) => void }) {
  const [taux, setTaux] = useState<Taux[] | null>(null);
  const [montant, setMontant] = useState("");
  const [dateEffet, setDateEffet] = useState(toISODate(new Date()));
  const [busy, setBusy] = useState(false);
  const [erreur, setErreur] = useState("");
  const nom = [prof.prenom, prof.nom].filter(Boolean).join(" ") || "ce prof";

  const charger = useCallback(() => {
    fetch(`/api/admin/planning/profs/${prof.id}/taux`, { headers: adminAuthHeaders(), cache: "no-store" })
      .then((r) => r.json())
      .then((d) => setTaux(d.taux ?? []))
      .catch(() => setTaux([]));
  }, [prof.id]);
  useEffect(() => charger(), [charger]);

  const montantValide = /^\d+([.,]\d{1,2})?$/.test(montant.trim());

  async function ajouter() {
    setBusy(true);
    setErreur("");
    try {
      const res = await fetch(`/api/admin/planning/profs/${prof.id}/taux`, {
        method: "POST",
        headers: jsonHeaders(),
        body: JSON.stringify({ montant_horaire: montant.trim(), date_effet: dateEffet }),
      });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) { setErreur(d.error || "Échec de l'ajout."); return; }
      flash("Taux ajouté ✓");
      setMontant("");
      charger();
    } finally {
      setBusy(false);
    }
  }

  async function supprimer(tauxId: string) {
    setBusy(true);
    try {
      const res = await fetch(`/api/admin/planning/profs/${prof.id}/taux`, {
        method: "DELETE",
        headers: jsonHeaders(),
        body: JSON.stringify({ tauxId }),
      });
      if (res.ok) { flash("Taux supprimé"); charger(); }
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="fixed inset-0 z-[65] flex items-center justify-center bg-ink/40 p-4" onClick={onClose}>
      <div className="max-h-[90vh] w-full max-w-md overflow-y-auto rounded-[1.5rem] bg-white p-6" onClick={(e) => e.stopPropagation()}>
        <h2 className="font-display text-xl font-extrabold uppercase text-ink">Taux horaire</h2>
        <p className="mt-1 text-sm text-smoke">
          <strong className="text-ink">{nom}</strong> · le taux appliqué à une séance est celui en vigueur à sa date.
        </p>

        {/* Historique */}
        <div className="mt-4">
          {taux === null ? (
            <p className="text-sm text-smoke">Chargement…</p>
          ) : taux.length === 0 ? (
            <p className="rounded-xl border border-dashed border-line bg-paper-2/40 py-5 text-center text-sm text-smoke">
              Aucun taux renseigné.
            </p>
          ) : (
            <ul className="space-y-2">
              {taux.map((t) => (
                <li key={t.id} className="flex items-center justify-between gap-3 rounded-xl border border-line p-3">
                  <span className="text-sm text-ink">
                    <strong>{formatMontant(t.montant_horaire)}</strong> de l&apos;heure à partir du {frDate(t.date_effet)}
                  </span>
                  <button onClick={() => supprimer(t.id)} disabled={busy} className="shrink-0 text-xs font-semibold text-red-600 hover:underline disabled:opacity-50">
                    Supprimer
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>

        {/* Ajout d'un nouveau taux */}
        <div className="mt-4 rounded-xl border border-line p-4">
          <h3 className="font-display text-sm font-extrabold uppercase text-ink">Nouveau taux</h3>
          <div className="mt-3 space-y-3">
            <label className="block">
              <span className="mb-1 block text-xs font-semibold text-ink">Montant horaire (€)</span>
              <input value={montant} onChange={(e) => setMontant(e.target.value)} inputMode="decimal" placeholder="Ex. 25,00" className={inputCls} />
            </label>
            <DatePicker label="À partir du" value={dateEffet} onChange={setDateEffet} />
            {erreur && <p className="rounded-lg border border-red-200 bg-red-50 p-2.5 text-xs font-semibold text-red-700">{erreur}</p>}
            <button onClick={ajouter} disabled={busy || !montantValide || !dateEffet} className="rounded-full bg-orange px-5 py-2.5 text-sm font-bold text-white hover:bg-orange-600 disabled:opacity-40">
              Ajouter ce taux
            </button>
          </div>
        </div>

        <div className="mt-5 flex justify-end">
          <button onClick={onClose} className="rounded-full border border-line px-5 py-2.5 text-sm font-semibold text-ink">Fermer</button>
        </div>
      </div>
    </div>
  );
}
