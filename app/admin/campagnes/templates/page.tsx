"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { adminAuthHeaders } from "@/lib/admin-auth";
import { CATEGORIES, type TemplateMail } from "@/lib/campagnes";
import { VariablesBar } from "@/components/admin/VariablesBar";

const empty = {
  id: "",
  nom: "",
  objet: "",
  contenu: "",
  categorie: "informatif" as string,
  est_defaut: false,
};
const catLabel = (k: string | null) =>
  CATEGORIES.find((c) => c.key === k)?.label ?? "Autres";

export default function TemplatesPage() {
  const [templates, setTemplates] = useState<TemplateMail[]>([]);
  const [loading, setLoading] = useState(true);
  const [edit, setEdit] = useState<Partial<TemplateMail> | null>(null);
  const [busy, setBusy] = useState(false);
  const contenuRef = useRef<HTMLTextAreaElement>(null);

  // Insère une variable/bouton à la position du curseur (comme le constructeur).
  function insertVar(token: string) {
    const el = contenuRef.current;
    const cur = edit?.contenu ?? "";
    if (!el) {
      setEdit((e) => ({ ...e, contenu: cur + token }));
      return;
    }
    const start = el.selectionStart;
    const end = el.selectionEnd;
    setEdit((e) => ({ ...e, contenu: cur.slice(0, start) + token + cur.slice(end) }));
    requestAnimationFrame(() => {
      el.focus();
      el.selectionStart = el.selectionEnd = start + token.length;
    });
  }

  async function load() {
    setLoading(true);
    const r = await fetch("/api/admin/templates", {
      headers: adminAuthHeaders(),
      cache: "no-store",
    });
    const d = await r.json();
    setTemplates(d.templates ?? []);
    setLoading(false);
  }
  useEffect(() => {
    load();
  }, []);

  async function save() {
    if (!edit?.nom?.trim()) return;
    setBusy(true);
    try {
      const isNew = !edit.id;
      const res = await fetch(
        isNew ? "/api/admin/templates" : `/api/admin/templates/${edit.id}`,
        {
          method: isNew ? "POST" : "PUT",
          headers: { "Content-Type": "application/json", ...adminAuthHeaders() },
          body: JSON.stringify({
            nom: edit.nom,
            objet: edit.objet ?? "",
            contenu: edit.contenu ?? "",
            categorie: edit.categorie ?? null,
          }),
        },
      );
      if (res.ok) {
        setEdit(null);
        await load();
      }
    } finally {
      setBusy(false);
    }
  }

  async function remove(t: TemplateMail) {
    if (t.est_defaut) return;
    if (!confirm(`Supprimer le template « ${t.nom} » ?`)) return;
    await fetch(`/api/admin/templates/${t.id}`, {
      method: "DELETE",
      headers: adminAuthHeaders(),
    });
    await load();
  }

  return (
    <div>
      <Link
        href="/admin/campagnes"
        className="text-sm font-semibold text-smoke hover:text-ink"
      >
        ← Campagnes
      </Link>
      <div className="mt-4 flex flex-wrap items-end justify-between gap-4">
        <h1 className="font-display text-4xl font-black uppercase text-ink">
          Templates d&apos;email
        </h1>
        <button
          onClick={() => setEdit({ ...empty })}
          className="rounded-full bg-orange px-5 py-2.5 text-sm font-bold text-white hover:bg-orange/90"
        >
          + Nouveau template
        </button>
      </div>

      {loading ? (
        <div className="mt-8 flex h-40 items-center justify-center">
          <span className="h-7 w-7 animate-spin rounded-full border-2 border-ink/20 border-t-orange" />
        </div>
      ) : (
        <div className="mt-8 space-y-8">
          {[
            ...CATEGORIES,
            { key: "__autres__", label: "Autres" },
          ].map((cat) => {
            const items = templates.filter((t) =>
              cat.key === "__autres__"
                ? !t.categorie || !CATEGORIES.some((c) => c.key === t.categorie)
                : t.categorie === cat.key,
            );
            if (items.length === 0) return null;
            return (
              <section key={cat.key}>
                <h2 className="font-display text-lg font-extrabold uppercase tracking-wide text-ink">
                  {cat.label}{" "}
                  <span className="text-sm font-semibold text-smoke">({items.length})</span>
                </h2>
                <div className="mt-3 grid gap-4 sm:grid-cols-2">
                  {items.map((t) => (
                    <div key={t.id} className="rounded-2xl border border-line bg-white p-5">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <p className="font-semibold text-ink">{t.nom}</p>
                          <p className="mt-0.5 truncate text-sm text-smoke">{t.objet}</p>
                        </div>
                        {t.est_defaut && (
                          <span className="shrink-0 rounded-full bg-paper-2 px-2.5 py-0.5 text-[0.65rem] font-bold uppercase text-smoke">
                            Défaut
                          </span>
                        )}
                      </div>
                      <p className="mt-3 line-clamp-3 whitespace-pre-wrap text-xs text-smoke">
                        {t.contenu}
                      </p>
                      <div className="mt-4 flex gap-3">
                        <button onClick={() => setEdit(t)} className="text-sm font-bold text-orange">
                          Modifier
                        </button>
                        {!t.est_defaut && (
                          <button onClick={() => remove(t)} className="text-sm font-semibold text-red-600">
                            Supprimer
                          </button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </section>
            );
          })}
        </div>
      )}

      {/* Modal édition */}
      {edit && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink/40 p-4">
          <div className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-[1.5rem] bg-white p-6">
            <h2 className="font-display text-xl font-extrabold uppercase text-ink">
              {edit.id ? "Modifier le template" : "Nouveau template"}
            </h2>
            <div className="mt-4 space-y-3">
              <Field
                label="Nom"
                value={edit.nom ?? ""}
                onChange={(v) => setEdit({ ...edit, nom: v })}
              />
              <Field
                label="Objet"
                value={edit.objet ?? ""}
                onChange={(v) => setEdit({ ...edit, objet: v })}
              />
              <label className="block">
                <span className="mb-1.5 block text-sm font-semibold text-ink">
                  Famille
                </span>
                <select
                  value={edit.categorie ?? "informatif"}
                  onChange={(e) => setEdit({ ...edit, categorie: e.target.value })}
                  className="focus-ring w-full rounded-xl border border-line bg-paper-2 px-3 py-2 text-sm outline-none focus:border-orange"
                >
                  {CATEGORIES.map((c) => (
                    <option key={c.key} value={c.key}>
                      {c.label}
                    </option>
                  ))}
                </select>
              </label>
              <div>
                <span className="mb-1.5 block text-sm font-semibold text-ink">
                  Contenu
                </span>
                <VariablesBar onInsert={insertVar} />
                <textarea
                  ref={contenuRef}
                  rows={12}
                  value={edit.contenu ?? ""}
                  onChange={(e) => setEdit({ ...edit, contenu: e.target.value })}
                  className="focus-ring min-h-[16rem] w-full rounded-xl border border-line bg-paper-2 px-3 py-2 text-sm leading-relaxed outline-none focus:border-orange"
                />
              </div>
            </div>
            <div className="mt-5 flex items-center justify-end gap-3">
              <button
                onClick={() => setEdit(null)}
                className="text-sm font-semibold text-smoke hover:text-ink"
              >
                Annuler
              </button>
              <button
                onClick={save}
                disabled={busy || !edit.nom?.trim()}
                className="rounded-full bg-orange px-5 py-2.5 text-sm font-bold text-white hover:bg-orange/90 disabled:opacity-50"
              >
                {busy ? "…" : "Enregistrer"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function Field({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-sm font-semibold text-ink">{label}</span>
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="focus-ring w-full rounded-xl border border-line bg-paper-2 px-3 py-2 text-sm outline-none focus:border-orange"
      />
    </label>
  );
}
