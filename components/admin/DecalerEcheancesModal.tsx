"use client";

import { useMemo, useState } from "react";
import { adminAuthHeaders } from "@/lib/admin-auth";
import { euro } from "@/lib/pricing";
import { DatePicker } from "@/components/ui/DatePicker";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { decalerDateMois, echeanceDecalable, depasseFinSaison } from "@/lib/decalage-echeances";
import type { Adherent, Paiement } from "@/lib/types";

const dateFr = (iso: string) => {
  if (!iso) return "—";
  const [y, m, d] = iso.split("-");
  return `${d}/${m}/${y}`;
};

// [021] Modale « Décaler les échéances » : report des échéances NON encaissées.
// Deux modes (tout décaler de N mois / modifier chaque date), aperçu avant/après,
// motif obligatoire, puis ConfirmDialog avec récap chiffré. Le serveur revalide tout.
export function DecalerEcheancesModal({
  adherent,
  paiements,
  onClose,
  onDone,
}: {
  adherent: Adherent;
  paiements: Paiement[];
  onClose: () => void;
  onDone: (msg: string) => void;
}) {
  const decalables = useMemo(
    () =>
      paiements
        .filter((p) => echeanceDecalable(p))
        .sort((a, b) => (a.numero_echeance ?? 0) - (b.numero_echeance ?? 0)),
    [paiements],
  );

  const [mode, setMode] = useState<"tout" | "dates">("tout");
  const [mois, setMois] = useState(1);
  const [dates, setDates] = useState<Record<string, string>>(() =>
    Object.fromEntries(decalables.map((p) => [p.id, decalerDateMois(p.date_prevue ?? "", 1)])),
  );
  const [motif, setMotif] = useState("");
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");

  // Aperçu avant/après (la nouvelle date dépend du mode).
  const apercu = useMemo(
    () =>
      decalables.map((p) => {
        const ancienne = p.date_prevue ?? "";
        const nouvelle = mode === "tout" ? decalerDateMois(ancienne, mois) : dates[p.id] ?? "";
        return {
          id: p.id,
          numero: p.numero_echeance ?? 0,
          montant: Number(p.montant || 0),
          ancienne,
          nouvelle,
          echec: p.statut === "echec",
          horsSaison: !!nouvelle && depasseFinSaison(nouvelle, ancienne),
        };
      }),
    [decalables, mode, mois, dates],
  );

  const motifOk = motif.trim().length > 0 && motif.trim().length <= 80;
  const datesOk = apercu.every((a) => /^\d{4}-\d{2}-\d{2}$/.test(a.nouvelle));
  const horsSaison = apercu.some((a) => a.horsSaison);

  function ouvrirConfirm() {
    setError("");
    if (!motifOk) { setError("Un motif court est requis (80 caractères maximum)."); return; }
    if (!datesOk) { setError("Renseignez une date valide pour chaque échéance."); return; }
    setConfirmOpen(true);
  }

  async function confirmer() {
    setSending(true);
    setError("");
    try {
      const res = await fetch(`/api/admin/adherents/${adherent.id}/decaler-echeances`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...adminAuthHeaders() },
        body: JSON.stringify({
          actionId: crypto.randomUUID(),
          motif: motif.trim(),
          mode,
          ...(mode === "tout" ? { mois } : { dates }),
        }),
      });
      const d = await res.json().catch(() => ({}));
      if (res.ok && d.ok) {
        if (d.dejaTraite) onDone("Décalage déjà enregistré (aucun double décalage).");
        else {
          const bits = [`${d.deplacees} échéance(s) décalée(s)`];
          if (d.aVerifier > 0) bits.push(`${d.aVerifier} à vérifier (paiement déjà en cours chez Stripe)`);
          if (d.refusees > 0) bits.push(`${d.refusees} refusée(s) (prélèvement en cours)`);
          onDone(bits.join(" · "));
        }
      } else {
        setError(d.error || "Échec du décalage.");
        setConfirmOpen(false);
      }
    } catch {
      setError("Erreur réseau.");
      setConfirmOpen(false);
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-ink/40 p-4" role="dialog" aria-modal="true">
      <div className="max-h-[92vh] w-full max-w-lg overflow-y-auto rounded-[1.5rem] bg-white p-6">
        <div className="flex items-start justify-between gap-4">
          <h2 className="font-display text-xl font-extrabold uppercase text-ink">Décaler les échéances</h2>
          <button onClick={onClose} className="shrink-0 text-2xl leading-none text-smoke hover:text-ink" aria-label="Fermer">×</button>
        </div>
        <p className="mt-1 text-sm text-smoke">
          {adherent.prenom} {adherent.nom} · {decalables.length} échéance(s) non encaissée(s)
        </p>

        {/* Choix du mode */}
        <div className="mt-4 flex gap-2">
          <ModeBtn active={mode === "tout"} onClick={() => setMode("tout")}>Tout décaler</ModeBtn>
          <ModeBtn active={mode === "dates"} onClick={() => setMode("dates")}>Modifier les dates</ModeBtn>
        </div>

        {mode === "tout" && (
          <div className="mt-3 flex items-center gap-2 text-sm">
            <span className="font-semibold text-ink">Décaler de</span>
            <select value={mois} onChange={(e) => setMois(Number(e.target.value))} className="rounded-xl border border-line px-2 py-2 text-sm">
              <option value={1}>1 mois</option>
              <option value={2}>2 mois</option>
              <option value={3}>3 mois</option>
            </select>
            <span className="text-smoke">(même jour du mois)</span>
          </div>
        )}

        {/* Aperçu avant / après */}
        <div className="mt-4 space-y-2">
          {apercu.map((a, i) => (
            <div key={a.id} className="rounded-xl border border-line bg-paper-2 p-3 text-sm">
              <div className="flex items-center justify-between gap-2">
                <span className="font-semibold text-ink">
                  Prélèvement {a.numero} · {euro(a.montant)}
                  {a.echec && <span className="ml-2 rounded-full bg-red-100 px-2 py-0.5 text-[0.65rem] font-bold text-red-700">échoué</span>}
                </span>
              </div>
              {mode === "tout" ? (
                <p className="mt-1 text-smoke">
                  <span className="line-through">{dateFr(a.ancienne)}</span> → <strong className="text-ink">{dateFr(a.nouvelle)}</strong>
                </p>
              ) : (
                <div className="mt-2 flex items-center gap-2">
                  <span className="text-smoke line-through">{dateFr(a.ancienne)} →</span>
                  <div className="w-40">
                    <DatePicker value={a.nouvelle} onChange={(iso) => setDates((d) => ({ ...d, [a.id]: iso }))} />
                  </div>
                </div>
              )}
              {a.horsSaison && (
                <p className="mt-1 text-xs font-semibold text-amber-600">⚠ Au-delà de la fin de saison.</p>
              )}
              {i < apercu.length - 1 && null}
            </div>
          ))}
        </div>

        {horsSaison && (
          <p className="mt-2 text-xs font-semibold text-amber-600">Au moins une échéance dépasse la fin de saison — à vérifier.</p>
        )}

        {/* Motif obligatoire */}
        <div className="mt-4">
          <span className="mb-1 block text-sm font-semibold text-ink">Motif (interne, obligatoire)</span>
          <input
            value={motif}
            onChange={(e) => setMotif(e.target.value.slice(0, 80))}
            maxLength={80}
            placeholder="Ex : coup dur, report demandé"
            className="focus-ring w-full rounded-xl border border-line bg-paper-2 px-3 py-2 text-sm outline-none focus:border-orange"
          />
          <span className="mt-1 block text-right text-[0.7rem] text-smoke">{motif.length}/80</span>
        </div>

        {error && <p className="mt-2 text-sm font-semibold text-red-600">{error}</p>}

        <div className="mt-5 flex items-center justify-end gap-3">
          <button onClick={onClose} className="text-sm font-semibold text-smoke hover:text-ink">Annuler</button>
          <button onClick={ouvrirConfirm} className="rounded-full bg-orange px-5 py-2.5 text-sm font-bold text-white hover:brightness-95">
            Continuer
          </button>
        </div>
      </div>

      {confirmOpen && (
        <ConfirmDialog
          title="Confirmer le décalage"
          message={
            <div className="space-y-1 text-left text-sm">
              {apercu.map((a) => (
                <p key={a.id}>
                  Prélèvement {a.numero} · <strong>{euro(a.montant)}</strong> : {dateFr(a.ancienne)} → <strong>{dateFr(a.nouvelle)}</strong>
                </p>
              ))}
              <p className="mt-2 text-smoke">Un nouvel échéancier sera envoyé à l&apos;adhérent.</p>
            </div>
          }
          confirmLabel={sending ? "Traitement…" : "Confirmer le décalage"}
          busy={sending}
          onConfirm={confirmer}
          onCancel={() => !sending && setConfirmOpen(false)}
        />
      )}
    </div>
  );
}

function ModeBtn({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex-1 rounded-xl border px-3 py-2 text-sm font-semibold transition-colors ${active ? "border-orange bg-orange-50 text-orange" : "border-line text-ink hover:border-orange/40"}`}
    >
      {children}
    </button>
  );
}
