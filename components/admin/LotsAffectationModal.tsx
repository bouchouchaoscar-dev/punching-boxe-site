"use client";

import { useCallback, useEffect, useState } from "react";
import { adminAuthHeaders } from "@/lib/admin-auth";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";

type CoursLite = { id: string; libelle: string | null };
type ProfLite = { id: string; nom: string | null; prenom: string | null };
type Lot = { lot: string; nb: number; coursIds: string[]; profIds: string[]; premiereSemaine: string; derniereSemaine: string };

const frSem = (iso: string) => { const [y, m, d] = iso.split("-"); return `${d}/${m}/${y}`; };

// [023] Gestion des lots « affecter sur une période » : suppression en bloc (entier
// ou seulement les séances à venir), via ConfirmDialog + récap chiffré.
export function LotsAffectationModal({ cours, profs, onClose, onDone }: {
  cours: CoursLite[];
  profs: ProfLite[];
  onClose: () => void;
  onDone: (msg: string) => void;
}) {
  const [lots, setLots] = useState<Lot[] | null>(null);
  const [confirm, setConfirm] = useState<{ lot: Lot; futures: boolean } | null>(null);
  const [busy, setBusy] = useState(false);
  const coursNom = (id: string) => cours.find((c) => c.id === id)?.libelle ?? "Cours";
  const profNom = (id: string) => { const p = profs.find((x) => x.id === id); return p ? `${p.prenom ?? ""} ${p.nom ?? ""}`.trim() : "Prof"; };

  const charger = useCallback(() => {
    fetch("/api/admin/planning/lots", { headers: adminAuthHeaders(), cache: "no-store" })
      .then((r) => r.json()).then((d) => setLots(d.lots ?? [])).catch(() => setLots([]));
  }, []);
  useEffect(() => { charger(); }, [charger]);

  async function supprimer(lot: string, futures: boolean) {
    setBusy(true);
    try {
      const r = await fetch("/api/admin/planning/affecter-periode", {
        method: "DELETE", headers: { "Content-Type": "application/json", ...adminAuthHeaders() },
        body: JSON.stringify({ lotId: lot, futuresSeulement: futures }),
      });
      const d = await r.json();
      setConfirm(null);
      if (r.ok) { onDone(`${d.supprimees} affectation(s) supprimée(s)`); charger(); }
    } finally { setBusy(false); }
  }

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-ink/40 p-4" onClick={onClose}>
      <div className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-[1.5rem] bg-white p-6" onClick={(e) => e.stopPropagation()}>
        <h2 className="font-display text-xl font-extrabold uppercase text-ink">Lots d&apos;affectation</h2>
        <p className="mt-1 text-sm text-smoke">Affectations créées « sur une période ». Supprimables en bloc.</p>

        {lots === null ? (
          <p className="mt-4 text-sm text-smoke">Chargement…</p>
        ) : lots.length === 0 ? (
          <p className="mt-4 rounded-xl border border-line bg-paper-2 p-4 text-center text-sm text-smoke">Aucun lot pour le moment.</p>
        ) : (
          <ul className="mt-4 space-y-2">
            {lots.map((l) => (
              <li key={l.lot} className="rounded-xl border border-line p-3">
                <p className="text-sm font-semibold text-ink">{frSem(l.premiereSemaine)} → {frSem(l.derniereSemaine)} · {l.nb} affectation(s)</p>
                <p className="mt-0.5 text-xs text-smoke">{l.coursIds.map(coursNom).join(", ")} — {l.profIds.map(profNom).join(", ")}</p>
                <div className="mt-2 flex gap-2">
                  <button onClick={() => setConfirm({ lot: l, futures: true })} className="rounded-full border border-line px-3 py-1.5 text-xs font-semibold text-ink hover:border-orange">Supprimer les séances à venir</button>
                  <button onClick={() => setConfirm({ lot: l, futures: false })} className="rounded-full border border-red-200 bg-red-50 px-3 py-1.5 text-xs font-semibold text-red-700 hover:bg-red-100">Supprimer tout le lot</button>
                </div>
              </li>
            ))}
          </ul>
        )}

        <div className="mt-5 flex justify-end">
          <button onClick={onClose} className="rounded-full border border-line px-5 py-2.5 text-sm font-semibold text-ink">Fermer</button>
        </div>
      </div>

      {confirm && (
        <ConfirmDialog
          title={confirm.futures ? "Supprimer les séances à venir" : "Supprimer tout le lot"}
          message={<p className="text-sm">{confirm.futures ? "Les séances déjà passées de ce lot sont conservées (historique) ; seules les séances à venir sont retirées." : `Les ${confirm.lot.nb} affectation(s) de ce lot seront supprimées (passé inclus).`}</p>}
          variant="danger"
          confirmLabel={busy ? "Suppression…" : "Supprimer"}
          busy={busy}
          onConfirm={() => supprimer(confirm.lot.lot, confirm.futures)}
          onCancel={() => !busy && setConfirm(null)}
        />
      )}
    </div>
  );
}
