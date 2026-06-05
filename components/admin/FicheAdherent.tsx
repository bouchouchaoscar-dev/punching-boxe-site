"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { StatutBadge } from "./StatutBadge";
import { ButtonAction } from "@/components/ui/Button";
import { euro, PACKAGE_LABEL } from "@/lib/pricing";
import type { Adherent } from "@/lib/types";

// Base de colonnes par document : <base>_valide (bool) + <base>_motif_refus (text).
type DocBase = "fiche" | "certificat" | "reglement" | "photo";

const MODE_LABEL: Record<string, string> = {
  stripe_1x: "Carte — 1 fois",
  stripe_2x: "Carte — 2 fois",
  stripe_3x: "Carte — 3 fois",
  stripe_4x: "Carte — 4 fois",
  especes: "Espèces",
};

const DOCS: {
  key: keyof Adherent;
  base: DocBase;
  label: string;
  obligatoire: boolean;
}[] = [
  { key: "fiche_inscription_url", base: "fiche", label: "Fiche d'inscription", obligatoire: true },
  { key: "certificat_medical_url", base: "certificat", label: "Certificat médical", obligatoire: false },
  { key: "reglement_url", base: "reglement", label: "Règlement intérieur", obligatoire: true },
  { key: "photo_url", base: "photo", label: "Photo d'identité", obligatoire: true },
];

export function FicheAdherent({ id }: { id: string }) {
  const [a, setA] = useState<Adherent | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState<Partial<Adherent>>({});
  const [toast, setToast] = useState<string | null>(null);
  const [refusing, setRefusing] = useState<DocBase | null>(null);
  const [refuseMotif, setRefuseMotif] = useState("");

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

  // Valide / dé-valide un document. Valider efface aussi son motif de refus.
  async function setDocValide(base: DocBase, valide: boolean) {
    const ok = await patch({
      [`${base}_valide`]: valide,
      ...(valide ? { [`${base}_motif_refus`]: null } : {}),
    });
    if (ok) showToast(valide ? "Document validé ✓" : "Validation retirée");
  }

  // Refuse un document avec un motif (invalide + notifie l'adhérent par email).
  async function refuserDoc(base: DocBase) {
    if (!refuseMotif.trim()) return;
    const ok = await patch({
      [`${base}_valide`]: false,
      [`${base}_motif_refus`]: refuseMotif.trim(),
    });
    if (ok) {
      setRefusing(null);
      setRefuseMotif("");
      showToast("Document refusé — adhérent notifié ✓");
    }
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
              {/* Validation globale DÉRIVÉE : auto-cochée quand fiche+règlement+photo validés. */}
              <DocsBadge valides={!!a.documents_valides} />
            </div>
            <p className="mt-1.5 text-xs text-smoke">
              Le dossier est validé automatiquement quand la fiche, le règlement
              et la photo sont validés. Le certificat médical ne bloque pas.
            </p>

            <div className="mt-5 space-y-3">
              {DOCS.map((d) => {
                const url = a[d.key] as string | null;
                const valide = !!a[`${d.base}_valide` as keyof Adherent];
                const motifRefus = a[
                  `${d.base}_motif_refus` as keyof Adherent
                ] as string | null;
                const enRefus = refusing === d.base;
                return (
                  <div
                    key={d.key}
                    className={`rounded-xl border p-4 ${
                      url ? "border-line" : "border-dashed border-line"
                    }`}
                  >
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <div className="min-w-0">
                        <p className="text-sm font-semibold text-ink">
                          {d.label}
                          {!d.obligatoire && (
                            <span className="ml-2 text-xs font-normal text-smoke">
                              (facultatif)
                            </span>
                          )}
                        </p>
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
                          <span className="mt-1 inline-block rounded-full bg-paper-2 px-2.5 py-0.5 text-xs font-bold text-smoke">
                            Non fourni
                          </span>
                        )}
                      </div>

                      {url && !enRefus && (
                        <div className="flex shrink-0 items-center gap-3">
                          <label className="inline-flex cursor-pointer items-center gap-2">
                            <input
                              type="checkbox"
                              checked={valide}
                              disabled={saving}
                              onChange={(e) => setDocValide(d.base, e.target.checked)}
                              className="h-4 w-4 accent-green-600"
                            />
                            <span
                              className={`text-sm font-bold ${
                                valide ? "text-green-600" : "text-ink"
                              }`}
                            >
                              ✓ Valider
                            </span>
                          </label>
                          {!valide && (
                            <button
                              onClick={() => {
                                setRefusing(d.base);
                                setRefuseMotif(motifRefus ?? "");
                              }}
                              className="text-xs font-semibold text-smoke transition-colors hover:text-red-600"
                            >
                              Refuser
                            </button>
                          )}
                        </div>
                      )}
                    </div>

                    {/* Motif existant (document refusé) */}
                    {url && !enRefus && motifRefus && !valide && (
                      <p className="mt-2 rounded-lg bg-red-50 px-3 py-2 text-xs font-semibold text-red-700">
                        ❌ Refusé : {motifRefus}
                      </p>
                    )}

                    {/* Saisie du motif de refus */}
                    {enRefus && (
                      <div className="mt-3">
                        <textarea
                          value={refuseMotif}
                          onChange={(e) => setRefuseMotif(e.target.value)}
                          rows={2}
                          placeholder="Motif du refus (ex : document non signé)…"
                          className="focus-ring w-full rounded-xl border border-line bg-paper-2 px-3 py-2 text-sm outline-none focus:border-orange"
                        />
                        <div className="mt-2 flex items-center gap-3">
                          <button
                            onClick={() => refuserDoc(d.base)}
                            disabled={saving || !refuseMotif.trim()}
                            className="rounded-full bg-red-600 px-4 py-1.5 text-xs font-bold text-white transition-colors hover:bg-red-700 disabled:opacity-50"
                          >
                            {saving ? "…" : "Confirmer le refus"}
                          </button>
                          <button
                            onClick={() => {
                              setRefusing(null);
                              setRefuseMotif("");
                            }}
                            className="text-xs font-semibold text-smoke hover:text-ink"
                          >
                            Annuler
                          </button>
                        </div>
                        <p className="mt-1.5 text-xs text-smoke">
                          Un email est envoyé à l&apos;adhérent pour l&apos;inviter
                          à déposer un nouveau document.
                        </p>
                      </div>
                    )}
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
