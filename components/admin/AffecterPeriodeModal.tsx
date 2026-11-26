"use client";

import { useMemo, useState } from "react";
import { adminAuthHeaders } from "@/lib/admin-auth";
import { DatePicker } from "@/components/ui/DatePicker";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { JOURS, jourLong, disciplineLabel, plageHoraire } from "@/lib/planning";

type CoursLite = { id: string; libelle: string | null; discipline: string | null; type_adherent: string | null; jour_semaine: number | null; heure_debut: string | null; heure_fin: string | null };
type ProfLite = { id: string; nom: string | null; prenom: string | null };

const publicLabel = (t: string | null) => (t === "jeune" ? "Jeunes" : t === "adulte" ? "Adultes" : "Tous");

// [023] Affecter un ou plusieurs profs à des cours sur une PÉRIODE (passé autorisé).
// Aperçu chiffré (séances à affecter, dont déjà affectées) + choix conserver/remplacer,
// puis application en un lot (une seule opération base).
export function AffecterPeriodeModal({ cours, profs, onClose, onDone }: {
  cours: CoursLite[];
  profs: ProfLite[];
  onClose: () => void;
  onDone: (msg: string) => void;
}) {
  const [coursSel, setCoursSel] = useState<Set<string>>(new Set());
  const [profSel, setProfSel] = useState<Set<string>>(new Set());
  const [debut, setDebut] = useState("");
  const [fin, setFin] = useState("");
  const [remplacer, setRemplacer] = useState(false);
  const [recap, setRecap] = useState<{ seancesTotal: number; deja: number } | null>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const parJour = useMemo(() => JOURS.map((j) => ({ jour: j, liste: cours.filter((c) => c.jour_semaine === j.valeur) })).filter((g) => g.liste.length), [cours]);
  // Libellé dynamique des profs sélectionnés (prénom si un seul, « ces profs » sinon).
  const multiProfs = profSel.size > 1;
  const nomProfs = multiProfs ? "ces profs" : (profs.find((p) => profSel.has(p.id))?.prenom || "ce prof");
  const pret = coursSel.size > 0 && profSel.size > 0 && /^\d{4}-\d{2}-\d{2}$/.test(debut) && /^\d{4}-\d{2}-\d{2}$/.test(fin) && debut <= fin;
  const toggle = (set: Set<string>, id: string, setter: (s: Set<string>) => void) => { const n = new Set(set); n.has(id) ? n.delete(id) : n.add(id); setter(n); };

  async function envoyer(action: "apercu" | "appliquer") {
    setBusy(true); setError("");
    try {
      const res = await fetch("/api/admin/planning/affecter-periode", {
        method: "POST", headers: { "Content-Type": "application/json", ...adminAuthHeaders() },
        body: JSON.stringify({ action, coursIds: [...coursSel], profIds: [...profSel], debut, fin, remplacer }),
      });
      const d = await res.json();
      if (!res.ok) { setError(d.error || "Impossible."); return null; }
      return d;
    } catch { setError("Erreur réseau."); return null; } finally { setBusy(false); }
  }

  async function apercu() {
    const d = await envoyer("apercu");
    if (!d) return;
    if (d.seancesTotal === 0) { setError("Aucune séance dans cette période pour les cours choisis (jours/vacances)."); return; }
    setRecap({ seancesTotal: d.seancesTotal, deja: d.deja });
    setConfirmOpen(true);
  }

  async function appliquer() {
    const d = await envoyer("appliquer");
    if (!d) { setConfirmOpen(false); return; }
    onDone(`${d.inserees} affectation(s) créée(s)` + (d.mailsEnvoyes ? ` · ${d.mailsEnvoyes} prof(s) notifié(s)` : "") + (remplacer && recap?.deja ? ` · ${recap.deja} remplacée(s)` : ""));
  }

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-ink/40 p-4" onClick={onClose}>
      <div className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-[1.5rem] bg-white p-6" onClick={(e) => e.stopPropagation()}>
        <h2 className="font-display text-xl font-extrabold uppercase text-ink">Affecter sur une période</h2>
        <p className="mt-1 text-sm text-smoke">Génère une affectation par séance sur la période (vacances exclues).</p>

        <div className="mt-4 grid grid-cols-2 gap-3">
          <div><label className="mb-1 block text-sm font-semibold text-ink">Du</label><DatePicker value={debut} onChange={setDebut} /></div>
          <div><label className="mb-1 block text-sm font-semibold text-ink">Au</label><DatePicker value={fin} onChange={setFin} /></div>
        </div>

        <p className="mt-4 text-sm font-semibold text-ink">Cours</p>
        <div className="mt-1 space-y-3">
          {parJour.map((g) => (
            <div key={g.jour.valeur}>
              <p className="text-xs font-bold uppercase tracking-wide text-smoke">{jourLong(g.jour.valeur)}</p>
              <div className="mt-1 space-y-1">
                {g.liste.map((c) => (
                  <label key={c.id} className="flex cursor-pointer items-center gap-2 rounded-lg border border-line px-2.5 py-1.5 text-sm">
                    <input type="checkbox" checked={coursSel.has(c.id)} onChange={() => toggle(coursSel, c.id, setCoursSel)} className="h-4 w-4 accent-orange" />
                    <span className="text-ink">{c.libelle}</span>
                    <span className="text-xs text-smoke">{disciplineLabel(c.discipline)} · {publicLabel(c.type_adherent)} · {plageHoraire(c.heure_debut, c.heure_fin)}</span>
                  </label>
                ))}
              </div>
            </div>
          ))}
        </div>

        <p className="mt-4 text-sm font-semibold text-ink">Prof(s)</p>
        <div className="mt-1 flex flex-wrap gap-2">
          {profs.map((p) => (
            <label key={p.id} className={`flex cursor-pointer items-center gap-2 rounded-full border px-3 py-1.5 text-sm ${profSel.has(p.id) ? "border-orange bg-orange-50 text-orange" : "border-line text-ink"}`}>
              <input type="checkbox" checked={profSel.has(p.id)} onChange={() => toggle(profSel, p.id, setProfSel)} className="h-4 w-4 accent-orange" />
              {p.prenom} {p.nom}
            </label>
          ))}
        </div>

        {error && <p className="mt-3 rounded-xl bg-red-50 p-2.5 text-sm font-semibold text-red-700">{error}</p>}
        <div className="mt-5 flex items-center justify-end gap-3">
          <button onClick={onClose} className="text-sm font-semibold text-smoke hover:text-ink">Annuler</button>
          <button onClick={apercu} disabled={busy || !pret} className="rounded-full bg-orange px-5 py-2.5 text-sm font-bold text-white hover:brightness-95 disabled:opacity-40">{busy ? "…" : "Aperçu"}</button>
        </div>
      </div>

      {confirmOpen && recap && (
        <ConfirmDialog
          title="Confirmer l'affectation"
          message={
            <div className="space-y-2 text-left text-sm">
              <p><strong>{recap.seancesTotal}</strong> séance{recap.seancesTotal > 1 ? "s" : ""} à affecter{recap.deja > 0 ? <>, dont <strong>{recap.deja}</strong> {recap.deja > 1 ? "ont" : "a"} déjà un prof.</> : "."}</p>
              {recap.deja > 0 && (
                <div className="space-y-2">
                  <label className="flex items-start gap-2">
                    <input type="radio" checked={!remplacer} onChange={() => setRemplacer(false)} className="mt-0.5 accent-orange" />
                    <span>
                      Garder les profs déjà en place sur ces <strong>{recap.deja}</strong> séance{recap.deja > 1 ? "s" : ""}{" "}
                      <span className="text-smoke">({nomProfs} {multiProfs ? "ne sont ajoutés" : "n'est ajouté"} que sur {recap.seancesTotal - recap.deja > 1 ? `les ${recap.seancesTotal - recap.deja} autres` : "l'autre séance"})</span>
                    </span>
                  </label>
                  <label className="flex items-start gap-2">
                    <input type="radio" checked={remplacer} onChange={() => setRemplacer(true)} className="mt-0.5 accent-orange" />
                    <span>Remplacer par {nomProfs} sur ces <strong>{recap.deja}</strong> séance{recap.deja > 1 ? "s" : ""}</span>
                  </label>
                </div>
              )}
              <p className="text-smoke">Les séances passées ne déclenchent aucun mail. Un seul mail récapitulatif par prof pour les séances à venir.</p>
            </div>
          }
          confirmLabel={busy ? "Affectation…" : "Confirmer"}
          busy={busy}
          onConfirm={appliquer}
          onCancel={() => !busy && setConfirmOpen(false)}
        />
      )}
    </div>
  );
}
