"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { StatutBadge } from "./StatutBadge";
import { ButtonAction } from "@/components/ui/Button";
import type { FileFieldKey } from "@/components/inscription/FileDrop";
import { euro, PACKAGE_LABEL } from "@/lib/pricing";
import type { Adherent } from "@/lib/types";

const MODE_LABEL: Record<string, string> = {
  stripe_1x: "Carte — 1 fois",
  stripe_2x: "Carte — 2 fois",
  stripe_3x: "Carte — 3 fois",
  stripe_4x: "Carte — 4 fois",
  especes: "Espèces",
};

const DOCS: {
  key: keyof Adherent;
  field: FileFieldKey;
  label: string;
  accept: string;
}[] = [
  { key: "fiche_inscription_url", field: "fiche_inscription", label: "Fiche d'inscription", accept: "application/pdf" },
  { key: "certificat_medical_url", field: "certificat_medical", label: "Certificat médical", accept: "application/pdf" },
  { key: "reglement_url", field: "reglement", label: "Règlement intérieur", accept: "application/pdf" },
  { key: "photo_url", field: "photo", label: "Photo d'identité", accept: "image/jpeg,image/png" },
];

export function FicheAdherent({ id }: { id: string }) {
  const [a, setA] = useState<Adherent | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState<Partial<Adherent>>({});
  const [toast, setToast] = useState<string | null>(null);
  const [uploading, setUploading] = useState<FileFieldKey | null>(null);

  function showToast(msg: string) {
    setToast(msg);
    window.setTimeout(() => setToast(null), 3000);
  }

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/adherents/${id}`, { cache: "no-store" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Introuvable.");
      setA(data.adherent);
      setForm(data.adherent);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erreur.");
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    load();
  }, [load]);

  async function patch(body: Record<string, unknown>) {
    setSaving(true);
    try {
      const res = await fetch(`/api/adherents/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (res.ok) {
        setA(data.adherent);
        setForm(data.adherent);
        setEditing(false);
      }
      return res.ok;
    } finally {
      setSaving(false);
    }
  }

  async function validerDocuments() {
    const ok = await patch({ action: "valider_documents" });
    if (ok) showToast("Documents validés ✓");
  }

  // Remplacement (ou ajout) d'un document depuis l'admin : ouvre un sélecteur de
  // fichier, envoie sur Supabase Storage (persist=1 → écrase + invalide la
  // validation), puis recharge la fiche.
  function replaceDocument(field: FileFieldKey, accept: string) {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = accept;
    input.onchange = async () => {
      const file = input.files?.[0];
      if (!file) return;
      setUploading(field);
      try {
        const fd = new FormData();
        fd.append("file", file);
        fd.append("adherentId", id);
        fd.append("field", field);
        fd.append("persist", "1");
        const res = await fetch("/api/upload-document", { method: "POST", body: fd });
        const data = await res.json().catch(() => ({}));
        if (res.ok) {
          await load();
          showToast("Document remplacé ✓");
        } else {
          showToast(data.error || "Échec de l'envoi du document.");
        }
      } catch {
        showToast("Erreur réseau pendant l'envoi.");
      } finally {
        setUploading(null);
      }
    };
    input.click();
  }

  if (loading)
    return (
      <div className="flex h-64 items-center justify-center">
        <span className="h-8 w-8 animate-spin rounded-full border-2 border-ink/20 border-t-orange" />
      </div>
    );

  if (error || !a)
    return (
      <div className="rounded-xl bg-amber-50 p-6 text-amber-800">
        {error || "Adhérent introuvable."}
        <div className="mt-4">
          <Link href="/admin/adherents" className="font-bold text-orange">
            ← Retour à la liste
          </Link>
        </div>
      </div>
    );

  return (
    <div>
      <Link
        href="/admin/adherents"
        className="text-sm font-semibold text-smoke hover:text-ink"
      >
        ← Tous les adhérents
      </Link>

      <div className="mt-4 grid gap-6 lg:grid-cols-[300px_1fr]">
        {/* Colonne gauche : photo + statut */}
        <div className="space-y-4">
          <div className="overflow-hidden rounded-[1.5rem] border border-line bg-white">
            <div className="relative aspect-square bg-paper-2">
              {a.photo_url ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={a.photo_url} alt={`${a.prenom} ${a.nom}`} className="h-full w-full object-cover" />
              ) : (
                <div className="flex h-full items-center justify-center font-display text-6xl font-black text-line">
                  {a.prenom[0]}
                  {a.nom[0]}
                </div>
              )}
            </div>
            <div className="p-5">
              <h1 className="font-display text-2xl font-extrabold uppercase text-ink">
                {a.prenom} {a.nom}
              </h1>
              <p className="mt-1 text-sm capitalize text-smoke">
                {a.type_adherent} · Saison {a.saison}
              </p>
              <div className="mt-3">
                <StatutBadge statut={a.statut_paiement} />
              </div>
            </div>
          </div>

          {/* Paiement */}
          <div className="rounded-[1.5rem] border border-line bg-white p-5">
            <h3 className="text-xs font-bold uppercase tracking-wide text-smoke">
              Paiement
            </h3>
            <p className="font-display mt-2 text-3xl font-black text-orange">
              {euro(a.montant_total)}
            </p>
            <p className="mt-1 text-sm text-smoke">
              {MODE_LABEL[a.mode_paiement] ?? a.mode_paiement}
            </p>
            {a.statut_paiement === "en_attente" && (
              <ButtonAction
                onClick={() => patch({ action: "confirmer_especes" })}
                disabled={saving}
                size="md"
                className="mt-4 w-full"
              >
                {saving ? "…" : "Confirmer paiement espèces"}
              </ButtonAction>
            )}
          </div>
        </div>

        {/* Colonne droite : infos + documents */}
        <div className="space-y-6">
          <div className="rounded-[1.5rem] border border-line bg-white p-6">
            <div className="flex items-center justify-between">
              <h3 className="font-display text-lg font-extrabold uppercase text-ink">
                Informations
              </h3>
              {!editing ? (
                <button
                  onClick={() => setEditing(true)}
                  className="text-sm font-bold text-orange"
                >
                  Modifier
                </button>
              ) : (
                <div className="flex gap-3">
                  <button
                    onClick={() => {
                      setEditing(false);
                      setForm(a);
                    }}
                    className="text-sm font-semibold text-smoke"
                  >
                    Annuler
                  </button>
                  <button
                    onClick={() =>
                      patch({
                        email: form.email,
                        telephone: form.telephone,
                        adresse: form.adresse,
                        ville: form.ville,
                        code_postal: form.code_postal,
                      })
                    }
                    disabled={saving}
                    className="text-sm font-bold text-orange"
                  >
                    {saving ? "…" : "Enregistrer"}
                  </button>
                </div>
              )}
            </div>

            <dl className="mt-5 grid gap-x-8 gap-y-4 sm:grid-cols-2">
              <Info
                label="Formule"
                value={a.package ? PACKAGE_LABEL[a.package] : "—"}
              />
              <Info label="Date de naissance" value={new Date(a.date_naissance).toLocaleDateString("fr-FR")} />
              <EditableInfo label="Email" editing={editing} value={form.email ?? ""} onChange={(v) => setForm({ ...form, email: v })} display={a.email} />
              <EditableInfo label="Téléphone" editing={editing} value={form.telephone ?? ""} onChange={(v) => setForm({ ...form, telephone: v })} display={a.telephone ?? "—"} />
              <EditableInfo label="Adresse" editing={editing} value={form.adresse ?? ""} onChange={(v) => setForm({ ...form, adresse: v })} display={a.adresse ?? "—"} />
              <EditableInfo label="Code postal" editing={editing} value={form.code_postal ?? ""} onChange={(v) => setForm({ ...form, code_postal: v })} display={a.code_postal ?? "—"} />
              <EditableInfo label="Ville" editing={editing} value={form.ville ?? ""} onChange={(v) => setForm({ ...form, ville: v })} display={a.ville ?? "—"} />
              <Info label="Nouveau membre" value={a.nouveau_membre ? "Oui" : "Non"} />
              <Info label="Préparation physique" value={a.option_prepa_physique ? "Oui" : "Non"} />
              <Info label="Membres famille déjà inscrits" value={String(a.nb_membres_famille)} />
            </dl>
          </div>

          {/* Documents */}
          <div className="rounded-[1.5rem] border border-line bg-white p-6">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <h3 className="font-display text-lg font-extrabold uppercase text-ink">
                Documents
              </h3>
              <div className="flex items-center gap-3">
                <DocsBadge valides={!!a.documents_valides} />
                {!a.documents_valides && (
                  <ButtonAction
                    onClick={validerDocuments}
                    disabled={saving}
                    size="md"
                  >
                    {saving ? "…" : "✓ Valider les documents"}
                  </ButtonAction>
                )}
              </div>
            </div>

            <div className="mt-5 grid gap-3 sm:grid-cols-2">
              {DOCS.map((d) => {
                const url = a[d.key] as string | null;
                const isUploading = uploading === d.field;
                return (
                  <div
                    key={d.key}
                    className={`flex items-center justify-between gap-3 rounded-xl border p-4 text-sm ${
                      url ? "border-line" : "border-dashed border-line"
                    }`}
                  >
                    <div className="min-w-0">
                      <p className="font-semibold text-ink">{d.label}</p>
                      {url ? (
                        <a
                          href={url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="mt-1 inline-block text-xs font-bold text-orange hover:underline"
                        >
                          Ouvrir →
                        </a>
                      ) : (
                        <p className="mt-1 text-xs text-smoke">Non fourni</p>
                      )}
                    </div>
                    <button
                      onClick={() => replaceDocument(d.field, d.accept)}
                      disabled={isUploading}
                      className="shrink-0 whitespace-nowrap rounded-full border border-line bg-white px-3 py-1.5 text-xs font-bold text-ink transition-colors hover:border-orange hover:text-orange disabled:opacity-50"
                    >
                      {isUploading ? "Envoi…" : url ? "Remplacer" : "Ajouter"}
                    </button>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>

      {/* Toast */}
      {toast && (
        <div className="fixed bottom-6 right-6 z-50 rounded-xl bg-ink px-5 py-3 text-sm font-bold text-white shadow-lg">
          {toast}
        </div>
      )}
    </div>
  );
}

function DocsBadge({ valides }: { valides: boolean }) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-bold ${
        valides
          ? "bg-green-100 text-green-700"
          : "bg-orange-50 text-orange"
      }`}
    >
      {valides ? "Docs ✓" : "Docs ⏳"}
    </span>
  );
}

function Info({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-xs font-bold uppercase tracking-wide text-smoke">
        {label}
      </dt>
      <dd className="mt-1 font-medium text-ink">{value}</dd>
    </div>
  );
}

function EditableInfo({
  label,
  editing,
  value,
  display,
  onChange,
}: {
  label: string;
  editing: boolean;
  value: string;
  display: string;
  onChange: (v: string) => void;
}) {
  return (
    <div>
      <dt className="text-xs font-bold uppercase tracking-wide text-smoke">
        {label}
      </dt>
      {editing ? (
        <input
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="focus-ring mt-1 w-full rounded-lg border border-line bg-paper-2 px-3 py-1.5 text-sm outline-none focus:border-orange"
        />
      ) : (
        <dd className="mt-1 font-medium text-ink">{display}</dd>
      )}
    </div>
  );
}
