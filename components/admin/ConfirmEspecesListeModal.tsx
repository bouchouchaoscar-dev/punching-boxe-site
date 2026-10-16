"use client";

import { useCallback, useEffect, useState } from "react";
import { adminAuthHeaders } from "@/lib/admin-auth";
import { formaterPrenom, formaterNom } from "@/lib/noms";
import type { Adherent } from "@/lib/types";
import { EncaissementEspeces, type VersementUI } from "./EncaissementEspeces";

// [P1] Modale de confirmation des espèces depuis la LISTE des adhérents. Réutilise
// EncaissementEspeces (Tout encaisser / Encaisser une partie + historique) et la
// même route admin protégée — aucune logique dupliquée. Évite la validation en un
// clic par erreur.
export function ConfirmEspecesListeModal({
  adherent,
  onClose,
  onChanged,
}: {
  adherent: Adherent;
  onClose: () => void;
  onChanged: () => void;
}) {
  const [cible, setCible] = useState<{ du: number; encaisse: number; reste: number } | null>(null);
  const [versements, setVersements] = useState<VersementUI[]>([]);
  const [toast, setToast] = useState("");
  const nom = `${formaterPrenom(adherent.prenom)} ${formaterNom(adherent.nom)}`.trim();

  const charger = useCallback(() => {
    fetch(`/api/admin/adherents/${adherent.id}/encaisser-especes`, { headers: adminAuthHeaders(), cache: "no-store" })
      .then((r) => r.json())
      .then((d) => {
        setCible(d.cotisation ?? null);
        setVersements((d.versements ?? []).filter((v: { changementId: string | null }) => !v.changementId));
      })
      .catch(() => {});
  }, [adherent.id]);
  useEffect(() => { charger(); }, [charger]);

  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center bg-ink/40 p-4" role="dialog" aria-modal="true" onClick={onClose}>
      <div className="max-h-[90vh] w-full max-w-md overflow-y-auto rounded-[1.5rem] bg-white p-6" onClick={(e) => e.stopPropagation()}>
        <h2 className="font-display text-lg font-extrabold uppercase text-ink">Confirmer le paiement en espèces</h2>
        <p className="mt-1 text-sm text-smoke">de <strong className="text-ink">{nom}</strong></p>
        {toast && <p className="mt-3 rounded-xl bg-paper-2 p-2 text-sm font-semibold text-ink">{toast}</p>}
        {cible ? (
          <EncaissementEspeces
            adherentId={adherent.id}
            du={cible.du}
            encaisse={cible.encaisse}
            reste={cible.reste}
            versements={versements}
            onChange={() => { charger(); onChanged(); }}
            showToast={setToast}
          />
        ) : (
          <p className="mt-4 text-sm text-smoke">Chargement…</p>
        )}
        <div className="mt-5 flex justify-end">
          <button onClick={onClose} className="rounded-full border border-line px-5 py-2 text-sm font-semibold text-ink hover:border-orange">Fermer</button>
        </div>
      </div>
    </div>
  );
}
