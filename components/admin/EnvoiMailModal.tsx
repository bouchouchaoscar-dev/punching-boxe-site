"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { adminAuthHeaders } from "@/lib/admin-auth";
import {
  CATEGORIES,
  remplacerVariables,
  type TemplateMail,
  type DestinataireVars,
} from "@/lib/campagnes";
import { VariablesBar } from "./VariablesBar";

// Cible d'un mail individuel. `vars` sert UNIQUEMENT à l'aperçu côté client ;
// le serveur recalcule les variables de façon autoritaire à l'envoi.
export type CibleMail = {
  type: "natif" | "ancien";
  id: string;
  prenom: string;
  nom: string;
  email: string | null;
  vars: DestinataireVars;
};

const catLabel = (k: string | null) =>
  CATEGORIES.find((c) => c.key === k)?.label ?? "Autres";

export function EnvoiMailModal({
  cible,
  onClose,
  onSent,
}: {
  cible: CibleMail;
  onClose: () => void;
  onSent?: () => void;
}) {
  const [templates, setTemplates] = useState<TemplateMail[]>([]);
  const [templateId, setTemplateId] = useState("");
  const [objet, setObjet] = useState("");
  const [contenu, setContenu] = useState("");
  const [sending, setSending] = useState(false);
  const [erreur, setErreur] = useState("");
  const [envoye, setEnvoye] = useState(false);
  const [desinscrit, setDesinscrit] = useState(false);
  const [apercu, setApercu] = useState(false);
  const contenuRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    fetch("/api/admin/templates", { headers: adminAuthHeaders(), cache: "no-store" })
      .then((r) => r.json())
      .then((d) => setTemplates(d.templates ?? []))
      .catch(() => {});
  }, []);

  useEffect(() => {
    if (!cible.email) return;
    fetch(`/api/admin/desinscription?email=${encodeURIComponent(cible.email)}`, {
      headers: adminAuthHeaders(),
      cache: "no-store",
    })
      .then((r) => r.json())
      .then((d) => setDesinscrit(!!d.desinscrit))
      .catch(() => {});
  }, [cible.email]);

  // Templates groupés par famille (pour l'optgroup du sélecteur).
  const groupes = useMemo(() => {
    const m = new Map<string, TemplateMail[]>();
    for (const t of templates) {
      const k = catLabel(t.categorie);
      if (!m.has(k)) m.set(k, []);
      m.get(k)!.push(t);
    }
    return [...m.entries()];
  }, [templates]);

  function appliquerTemplate(id: string) {
    setTemplateId(id);
    const t = templates.find((x) => x.id === id);
    if (t) {
      setObjet(t.objet);
      setContenu(t.contenu);
    }
  }

  function insertVar(token: string) {
    const el = contenuRef.current;
    if (!el) {
      setContenu((c) => c + token);
      return;
    }
    const start = el.selectionStart;
    const end = el.selectionEnd;
    setContenu((c) => c.slice(0, start) + token + c.slice(end));
    requestAnimationFrame(() => {
      el.focus();
      el.selectionStart = el.selectionEnd = start + token.length;
    });
  }

  const rendu = useMemo(
    () => ({
      objet: remplacerVariables(objet, cible.vars),
      contenu: remplacerVariables(contenu, cible.vars),
    }),
    [objet, contenu, cible.vars],
  );

  async function envoyer() {
    if (!objet.trim() || !contenu.trim() || !cible.email) return;
    setSending(true);
    setErreur("");
    try {
      const res = await fetch("/api/admin/send-individuel", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...adminAuthHeaders() },
        body: JSON.stringify({
          type: cible.type,
          id: cible.id,
          objet,
          contenu,
        }),
      });
      const d = await res.json().catch(() => ({}));
      if (res.ok && d.success) {
        setEnvoye(true);
        onSent?.();
        window.setTimeout(onClose, 1200);
      } else {
        setErreur(d.error || "Échec de l'envoi.");
      }
    } catch {
      setErreur("Erreur réseau.");
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-ink/40 p-4">
      <div className="max-h-[92vh] w-full max-w-2xl overflow-y-auto rounded-[1.5rem] bg-white p-6">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 className="font-display text-xl font-extrabold uppercase text-ink">
              Envoyer un mail
            </h2>
            <p className="mt-0.5 text-sm text-smoke">
              À <span className="font-semibold text-ink">{cible.prenom} {cible.nom}</span>
              {cible.email ? ` · ${cible.email}` : ""}
            </p>
          </div>
          <button
            onClick={onClose}
            className="shrink-0 text-2xl leading-none text-smoke hover:text-ink"
            aria-label="Fermer"
          >
            ×
          </button>
        </div>

        {!cible.email && (
          <div className="mt-4 rounded-xl bg-amber-50 px-4 py-3 text-sm font-semibold text-amber-800">
            Cette personne n&apos;a pas d&apos;adresse email : envoi impossible.
          </div>
        )}

        {desinscrit && cible.email && (
          <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
            <strong>Cette personne s&apos;est désinscrite des emails.</strong> Un
            envoi individuel reste possible (motif administratif légitime), mais à
            n&apos;utiliser qu&apos;en connaissance de cause.
          </div>
        )}

        {envoye ? (
          <div className="mt-6 rounded-xl bg-green-50 px-4 py-6 text-center text-sm font-bold text-green-700">
            ✅ Mail envoyé à {cible.prenom} {cible.nom}.
          </div>
        ) : (
          <div className="mt-4 space-y-3">
            <label className="block">
              <span className="mb-1.5 block text-sm font-semibold text-ink">
                Partir d&apos;un modèle (optionnel)
              </span>
              <select
                value={templateId}
                onChange={(e) => appliquerTemplate(e.target.value)}
                className="focus-ring w-full rounded-xl border border-line bg-paper-2 px-3 py-2 text-sm outline-none focus:border-orange"
              >
                <option value="">Message libre…</option>
                {groupes.map(([groupe, items]) => (
                  <optgroup key={groupe} label={groupe}>
                    {items.map((t) => (
                      <option key={t.id} value={t.id}>
                        {t.nom}
                      </option>
                    ))}
                  </optgroup>
                ))}
              </select>
            </label>

            <label className="block">
              <span className="mb-1.5 block text-sm font-semibold text-ink">Objet</span>
              <input
                value={objet}
                onChange={(e) => setObjet(e.target.value)}
                className="focus-ring w-full rounded-xl border border-line bg-paper-2 px-3 py-2 text-sm outline-none focus:border-orange"
              />
            </label>

            <div>
              <div className="mb-1.5 flex items-center justify-between">
                <span className="text-sm font-semibold text-ink">Contenu</span>
                <button
                  type="button"
                  onClick={() => setApercu((v) => !v)}
                  className="text-xs font-semibold text-orange"
                >
                  {apercu ? "Éditer" : "Aperçu"}
                </button>
              </div>
              {apercu ? (
                <div className="min-h-[16rem] rounded-xl border border-line bg-paper-2 p-4">
                  <p className="text-sm font-bold text-ink">{rendu.objet || "(objet vide)"}</p>
                  <div className="mt-2 whitespace-pre-wrap text-sm leading-relaxed text-ink">
                    {rendu.contenu || "(contenu vide)"}
                  </div>
                  <p className="mt-3 text-xs italic text-smoke">
                    Les boutons et le pied de désinscription sont ajoutés
                    automatiquement dans l&apos;email final.
                  </p>
                </div>
              ) : (
                <>
                  <VariablesBar onInsert={insertVar} />
                  <textarea
                    ref={contenuRef}
                    rows={12}
                    value={contenu}
                    onChange={(e) => setContenu(e.target.value)}
                    className="focus-ring min-h-[16rem] w-full rounded-xl border border-line bg-paper-2 px-3 py-2 text-sm leading-relaxed outline-none focus:border-orange"
                  />
                </>
              )}
            </div>

            {erreur && (
              <p className="rounded-xl bg-red-50 px-3 py-2 text-sm font-semibold text-red-700">
                {erreur}
              </p>
            )}

            <div className="flex items-center justify-end gap-3 pt-1">
              <button
                onClick={onClose}
                className="text-sm font-semibold text-smoke hover:text-ink"
              >
                Annuler
              </button>
              <button
                onClick={envoyer}
                disabled={
                  sending || !cible.email || !objet.trim() || !contenu.trim()
                }
                className="rounded-full bg-orange px-5 py-2.5 text-sm font-bold text-white transition-colors hover:bg-orange/90 disabled:opacity-50"
              >
                {sending ? "Envoi…" : "Envoyer le mail"}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
