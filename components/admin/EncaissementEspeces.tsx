"use client";

import { useState } from "react";
import { adminAuthHeaders } from "@/lib/admin-auth";
import { euro } from "@/lib/pricing";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";

export type VersementUI = { id: string; montant: number; date: string | null; note: string | null };

const dateFr = (iso: string | null) => {
  if (!iso) return "";
  const d = new Date(iso);
  return isNaN(d.getTime()) ? "" : new Intl.DateTimeFormat("fr-FR").format(d);
};
const round2 = (n: number) => Math.round(n * 100) / 100;

// [020] Encaissement ESPÈCES en une ou plusieurs fois (cotisation ou supplément).
// « Tout encaisser » (un clic) / « Encaisser une partie » (montant + note) + historique
// des versements supprimables (ConfirmDialog). Le serveur revérifie le reste dû.
export function EncaissementEspeces({
  adherentId,
  changementId = null,
  du,
  encaisse,
  reste,
  versements,
  onChange,
  showToast,
}: {
  adherentId: string;
  changementId?: string | null;
  du: number;
  encaisse: number;
  reste: number;
  versements: VersementUI[];
  onChange: () => void;
  showToast: (m: string) => void;
}) {
  const [busy, setBusy] = useState(false);
  const [modal, setModal] = useState(false);
  const [montant, setMontant] = useState<string>(String(reste));
  const [note, setNote] = useState("");
  const [suppr, setSuppr] = useState<VersementUI | null>(null);

  const headers = { ...adminAuthHeaders(), "Content-Type": "application/json" };

  async function encaisser(body: Record<string, unknown>) {
    setBusy(true);
    try {
      const res = await fetch(`/api/admin/adherents/${adherentId}/encaisser-especes`, {
        method: "POST",
        headers,
        body: JSON.stringify({ versementId: crypto.randomUUID(), changementId, ...body }),
      });
      const data = await res.json();
      if (res.ok) {
        showToast(data.solde ? "Encaissement soldé ✓" : `Versement enregistré — reste ${euro(data.reste)}`);
        setModal(false);
        setNote("");
        onChange();
      } else showToast(data.error || "Encaissement impossible.");
    } catch {
      showToast("Erreur réseau.");
    } finally {
      setBusy(false);
    }
  }

  async function supprimer(v: VersementUI) {
    setBusy(true);
    try {
      const res = await fetch(`/api/admin/adherents/${adherentId}/supprimer-versement`, {
        method: "POST",
        headers,
        body: JSON.stringify({ versementId: v.id }),
      });
      const data = await res.json();
      if (res.ok) { showToast("Versement supprimé"); onChange(); }
      else showToast(data.error || "Suppression impossible.");
    } catch {
      showToast("Erreur réseau.");
    } finally {
      setBusy(false);
      setSuppr(null);
    }
  }

  const montantNum = round2(Number(montant.replace(",", ".")) || 0);
  const montantValide = montantNum > 0 && Math.round(montantNum * 100) <= Math.round(reste * 100);

  return (
    <div className="mt-3">
      {/* Récap chiffré */}
      {encaisse > 0 ? (
        reste > 0 ? (
          <p className="text-sm text-ink">
            <strong>{euro(encaisse)}</strong> encaissés sur <strong>{euro(du)}</strong> — reste <strong className="text-orange">{euro(reste)}</strong>
          </p>
        ) : (
          <p className="text-sm font-semibold text-emerald-700">Soldé : {euro(du)} encaissés ✓</p>
        )
      ) : (
        <p className="text-sm text-smoke">À encaisser en espèces : <strong className="text-orange">{euro(reste)}</strong></p>
      )}

      {/* Actions */}
      {reste > 0 && (
        <div className="mt-3 flex flex-wrap gap-2">
          <button
            onClick={() => encaisser({ tout: true })}
            disabled={busy}
            className="rounded-full bg-orange px-4 py-2 text-sm font-bold text-white hover:brightness-95 disabled:opacity-50"
          >
            {busy ? "…" : "Tout encaisser"}
          </button>
          <button
            onClick={() => { setMontant(String(reste)); setNote(""); setModal(true); }}
            disabled={busy}
            className="rounded-full border border-line px-4 py-2 text-sm font-semibold text-ink hover:border-orange disabled:opacity-50"
          >
            Encaisser une partie
          </button>
        </div>
      )}

      {/* Historique des versements */}
      {versements.length > 0 && (
        <ul className="mt-3 divide-y divide-line rounded-xl border border-line">
          {versements.map((v) => (
            <li key={v.id} className="flex items-center justify-between gap-3 px-3 py-2 text-sm">
              <span className="min-w-0">
                <strong className="text-ink">{euro(v.montant)}</strong>
                <span className="text-smoke"> · {dateFr(v.date)}</span>
                {v.note && <span className="block truncate text-xs text-smoke">{v.note}</span>}
              </span>
              <button
                onClick={() => setSuppr(v)}
                disabled={busy}
                className="shrink-0 text-xs font-semibold text-red-600 hover:underline disabled:opacity-50"
              >
                Supprimer
              </button>
            </li>
          ))}
        </ul>
      )}

      {/* Modale « encaisser une partie » */}
      {modal && (
        <div className="fixed inset-0 z-[80] flex items-center justify-center bg-ink/40 p-4" role="dialog" aria-modal="true">
          <div className="w-full max-w-sm rounded-[1.5rem] bg-white p-6">
            <h2 className="font-display text-lg font-extrabold uppercase text-ink">Encaisser une partie</h2>
            <p className="mt-1 text-sm text-smoke">Reste dû : <strong className="text-ink">{euro(reste)}</strong></p>
            <label className="mt-4 block text-sm font-semibold text-ink">
              Montant encaissé
              <input
                type="number" inputMode="decimal" step="0.01" min="0.01" max={reste}
                value={montant}
                onChange={(e) => setMontant(e.target.value)}
                className="mt-1 w-full rounded-xl border border-line px-3 py-2 text-sm outline-none focus:border-orange"
              />
            </label>
            <label className="mt-3 block text-sm font-semibold text-ink">
              Note (facultatif)
              <input
                type="text" maxLength={80} value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder="Ex : versement maman"
                className="mt-1 w-full rounded-xl border border-line px-3 py-2 text-sm outline-none focus:border-orange"
              />
            </label>
            {!montantValide && montant.trim() !== "" && (
              <p className="mt-2 text-xs font-semibold text-red-600">Montant entre 0,01 € et {euro(reste)}.</p>
            )}
            <div className="mt-5 flex justify-end gap-3">
              <button onClick={() => setModal(false)} disabled={busy} className="rounded-full border border-line px-5 py-2.5 text-sm font-semibold text-ink disabled:opacity-50">Annuler</button>
              <button
                onClick={() => encaisser({ montant: montantNum, note: note.trim() || undefined })}
                disabled={busy || !montantValide}
                className="rounded-full bg-orange px-5 py-2.5 text-sm font-bold text-white hover:brightness-95 disabled:opacity-50"
              >
                {busy ? "…" : "Enregistrer"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Confirmation de suppression d'un versement */}
      {suppr && (
        <ConfirmDialog
          title="Supprimer le versement"
          message={<>Supprimer le versement de <strong>{euro(suppr.montant)}</strong> du {dateFr(suppr.date)} ? Le reste dû repassera à <strong>{euro(round2(reste + suppr.montant))}</strong>.</>}
          confirmLabel="Supprimer"
          variant="danger"
          busy={busy}
          onConfirm={() => supprimer(suppr)}
          onCancel={() => setSuppr(null)}
        />
      )}
    </div>
  );
}
