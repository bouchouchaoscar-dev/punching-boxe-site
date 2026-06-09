"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { adminAuthHeaders } from "@/lib/admin-auth";
import {
  SMART_LISTS,
  SEGMENTS_ANCIENS,
  DISCIPLINES,
  VARIABLES,
  filtrerAdherents,
  filtrerAnciens,
  remplacerVariables,
  type SmartListKey,
  type SegmentAncienKey,
  type DisciplineKey,
  type TemplateMail,
} from "@/lib/campagnes";
import { saisonCourante } from "@/lib/saison";
import type { Adherent } from "@/lib/types";

// Forme allégée renvoyée par /api/admin/anciens-recence (peu de PII côté client).
type AncienLite = {
  id: string;
  derniere_saison: string | null;
  disciplines: string[];
  has_email: boolean;
};

type ListePerso = { nom: string; emails: string[] };
const LS_KEY = "pbnp_listes_perso";

const STEPS = ["Destinataires", "Composer", "Envoi"];

export default function NouvelleCampagnePage() {
  const router = useRouter();
  const [step, setStep] = useState(0);

  // Données
  const [adherents, setAdherents] = useState<Adherent[]>([]);
  const [contactsCount, setContactsCount] = useState(0);
  const [templates, setTemplates] = useState<TemplateMail[]>([]);

  // Étape 1
  const [smartLists, setSmartLists] = useState<SmartListKey[]>([]);
  const [anciensSegments, setAnciensSegments] = useState<SegmentAncienKey[]>([]);
  const [disciplines, setDisciplines] = useState<DisciplineKey[]>([]);
  const [anciens, setAnciens] = useState<AncienLite[]>([]);
  const [manualOpen, setManualOpen] = useState(false);
  const [manualSelected, setManualSelected] = useState<Set<string>>(new Set());
  const [search, setSearch] = useState("");
  const [includeContacts, setIncludeContacts] = useState(false);
  const [savedLists, setSavedLists] = useState<ListePerso[]>([]);

  // Étape 2
  const [objet, setObjet] = useState("");
  const [contenu, setContenu] = useState("");
  const [previewOpen, setPreviewOpen] = useState(false);
  const contenuRef = useRef<HTMLTextAreaElement>(null);

  // Étape 3
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [sending, setSending] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [result, setResult] = useState<{
    sent: number;
    exclus: number;
    doublons: number;
    exclusSansEmail: number;
  } | null>(null);

  useEffect(() => {
    fetch("/api/adherents", { cache: "no-store" })
      .then((r) => r.json())
      .then((d) => setAdherents(d.adherents ?? []))
      .catch(() => {});
    fetch("/api/admin/contacts", { headers: adminAuthHeaders(), cache: "no-store" })
      .then((r) => r.json())
      .then((d) => setContactsCount(d.count ?? 0))
      .catch(() => {});
    fetch("/api/admin/templates", { headers: adminAuthHeaders(), cache: "no-store" })
      .then((r) => r.json())
      .then((d) => setTemplates(d.templates ?? []))
      .catch(() => {});
    fetch("/api/admin/anciens-recence", { headers: adminAuthHeaders(), cache: "no-store" })
      .then((r) => r.json())
      .then((d) => setAnciens(d.anciens ?? []))
      .catch(() => {});
    try {
      setSavedLists(JSON.parse(localStorage.getItem(LS_KEY) || "[]"));
    } catch {
      setSavedLists([]);
    }
  }, []);

  // Anciens correspondant aux segments/disciplines, séparés selon présence d'email.
  const { anciensAvecEmail, anciensSansEmail } = useMemo(() => {
    const saisonRef = saisonCourante(new Date());
    const f = filtrerAnciens(anciens, anciensSegments, disciplines, saisonRef);
    return {
      anciensAvecEmail: f.filter((a) => a.has_email).length,
      anciensSansEmail: f.filter((a) => !a.has_email).length,
    };
  }, [anciens, anciensSegments, disciplines]);

  // ---- Calcul des destinataires (côté client, indicatif) ----
  const { count, doublons } = useMemo(() => {
    const fromSmart = filtrerAdherents(adherents, smartLists).map((a) =>
      a.email.toLowerCase(),
    );
    const manual = [...manualSelected].map((e) => e.toLowerCase());
    const brut = [...fromSmart, ...manual];
    const uniq = new Set(brut);
    const adh = uniq.size;
    // Anciens comptés à part (emails non exposés au client) ; le serveur
    // dédoublonne l'ensemble à l'envoi. Comptage indicatif.
    const total =
      adh + anciensAvecEmail + (includeContacts ? contactsCount : 0);
    return { count: total, doublons: brut.length - adh };
  }, [adherents, smartLists, manualSelected, anciensAvecEmail, includeContacts, contactsCount]);

  // Destinataires adhérents réels (smart ∪ sélection manuelle), dédupliqués.
  const recipientsAdh = useMemo(() => {
    const byEmail = new Map(
      adherents.map((a) => [a.email.toLowerCase(), a] as const),
    );
    const map = new Map<string, Adherent>();
    for (const a of filtrerAdherents(adherents, smartLists))
      map.set(a.email.toLowerCase(), a);
    for (const e of manualSelected) {
      const a = byEmail.get(e.toLowerCase());
      if (a) map.set(a.email.toLowerCase(), a);
    }
    return [...map.values()];
  }, [adherents, smartLists, manualSelected]);

  // Préremplissage si on arrive depuis "Dupliquer".
  useEffect(() => {
    try {
      const raw = sessionStorage.getItem("pbnp_duplicate_campagne");
      if (raw) {
        const d = JSON.parse(raw) as { objet?: string; contenu?: string };
        if (d.objet) setObjet(d.objet);
        if (d.contenu) setContenu(d.contenu);
        sessionStorage.removeItem("pbnp_duplicate_campagne");
        setToast("Campagne dupliquée — objet et message pré-remplis");
        window.setTimeout(() => setToast(null), 3500);
      }
    } catch {
      /* ignore */
    }
  }, []);

  function toggleSmart(k: SmartListKey) {
    setSmartLists((s) => (s.includes(k) ? s.filter((x) => x !== k) : [...s, k]));
  }
  function toggleSegment(k: SegmentAncienKey) {
    setAnciensSegments((s) =>
      s.includes(k) ? s.filter((x) => x !== k) : [...s, k],
    );
  }
  function toggleDiscipline(k: DisciplineKey) {
    setDisciplines((s) => (s.includes(k) ? s.filter((x) => x !== k) : [...s, k]));
  }
  function toggleManual(email: string) {
    setManualSelected((s) => {
      const n = new Set(s);
      if (n.has(email)) n.delete(email);
      else n.add(email);
      return n;
    });
  }

  function saveListe() {
    const nom = prompt("Nom de la liste :");
    if (!nom?.trim()) return;
    const liste: ListePerso = { nom: nom.trim(), emails: [...manualSelected] };
    const next = [...savedLists.filter((l) => l.nom !== liste.nom), liste];
    setSavedLists(next);
    localStorage.setItem(LS_KEY, JSON.stringify(next));
  }
  function useListe(l: ListePerso) {
    setManualSelected(new Set(l.emails));
    setManualOpen(true);
  }

  // ---- Template ----
  function applyTemplate(id: string) {
    const t = templates.find((x) => x.id === id);
    if (!t) {
      setObjet("");
      setContenu("");
      return;
    }
    setObjet(t.objet);
    setContenu(t.contenu);
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

  async function saveAsTemplate() {
    const nom = prompt("Nom du nouveau template :");
    if (!nom?.trim()) return;
    await fetch("/api/admin/templates", {
      method: "POST",
      headers: { "Content-Type": "application/json", ...adminAuthHeaders() },
      body: JSON.stringify({ nom: nom.trim(), objet, contenu }),
    });
    const d = await (
      await fetch("/api/admin/templates", { headers: adminAuthHeaders() })
    ).json();
    setTemplates(d.templates ?? []);
    setToast("Template sauvegardé ✓");
    window.setTimeout(() => setToast(null), 2500);
  }

  // ---- Import CSV ----
  function importCsv() {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = ".csv,text/csv";
    input.onchange = async () => {
      const file = input.files?.[0];
      if (!file) return;
      const csv = await file.text();
      // Preview
      const pv = await (
        await fetch("/api/admin/import-contacts", {
          method: "POST",
          headers: { "Content-Type": "application/json", ...adminAuthHeaders() },
          body: JSON.stringify({ csv, preview: true }),
        })
      ).json();
      if (!pv.total) {
        alert(pv.error || "Aucun contact valide.");
        return;
      }
      const sample = (pv.preview ?? [])
        .map((c: { prenom?: string; nom?: string; email: string }) =>
          `${c.prenom ?? ""} ${c.nom ?? ""} <${c.email}>`.trim(),
        )
        .join("\n");
      if (!confirm(`${pv.total} contacts détectés. Aperçu :\n\n${sample}\n\nImporter ?`))
        return;
      const res = await (
        await fetch("/api/admin/import-contacts", {
          method: "POST",
          headers: { "Content-Type": "application/json", ...adminAuthHeaders() },
          body: JSON.stringify({ csv }),
        })
      ).json();
      setContactsCount((c) => c + (res.imported ?? 0));
      setIncludeContacts(true);
      setToast(`${res.imported ?? 0} contacts importés (${res.skipped ?? 0} doublons)`);
      window.setTimeout(() => setToast(null), 3500);
    };
    input.click();
  }

  // ---- Envoi ----
  async function envoyer() {
    setSending(true);
    try {
      const res = await fetch("/api/admin/send-campagne", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...adminAuthHeaders() },
        body: JSON.stringify({
          titre: objet,
          objet,
          contenu,
          smartLists,
          anciensSegments,
          disciplines,
          includeContacts,
          manualEmails: [...manualSelected],
        }),
      });
      const d = await res.json();
      if (res.ok && d.success) {
        // Bilan affiché (dont les désinscrits exclus) avant retour à l'historique.
        setResult({
          sent: d.sent ?? 0,
          exclus: d.exclus ?? 0,
          doublons: d.doublons ?? 0,
          exclusSansEmail: d.exclusSansEmail ?? 0,
        });
      } else {
        setConfirmOpen(false);
        setToast(d.error || "L'envoi a échoué.");
        window.setTimeout(() => setToast(null), 4000);
      }
    } finally {
      setSending(false);
    }
  }

  const exampleVars = {
    prenom: "Marie",
    nom: "Durand",
    formule: "Boxe Française",
    montant: "430",
  };

  const filteredAdherents = adherents.filter(
    (a) =>
      !search ||
      `${a.prenom} ${a.nom} ${a.email}`.toLowerCase().includes(search.toLowerCase()),
  );

  return (
    <div className="max-w-3xl">
      <Link
        href="/admin/campagnes"
        className="text-sm font-semibold text-smoke hover:text-ink"
      >
        ← Campagnes
      </Link>
      <h1 className="mt-4 font-display text-4xl font-black uppercase text-ink">
        Nouvelle campagne
      </h1>

      {/* Stepper */}
      <div className="mt-6 flex items-center gap-2">
        {STEPS.map((s, i) => (
          <div key={s} className="flex items-center gap-2">
            <span
              className={`flex h-8 w-8 items-center justify-center rounded-full text-sm font-bold ${
                i < step
                  ? "bg-orange text-white"
                  : i === step
                    ? "bg-ink text-white"
                    : "bg-paper-2 text-smoke ring-1 ring-line"
              }`}
            >
              {i < step ? "✓" : i + 1}
            </span>
            <span
              className={`text-sm font-semibold ${i === step ? "text-ink" : "text-smoke"}`}
            >
              {s}
            </span>
            {i < STEPS.length - 1 && <span className="mx-2 text-line">—</span>}
          </div>
        ))}
      </div>

      <div className="mt-8 rounded-[1.5rem] border border-line bg-white p-6 sm:p-8">
        {/* ÉTAPE 1 */}
        {step === 0 && (
          <div className="space-y-6">
            <div>
              <h2 className="font-display text-lg font-extrabold uppercase text-ink">
                Listes intelligentes
              </h2>
              <div className="mt-3 grid gap-2 sm:grid-cols-2">
                {SMART_LISTS.map((l) => (
                  <label
                    key={l.key}
                    className="flex cursor-pointer items-center gap-2.5 rounded-xl border border-line p-3 text-sm hover:border-orange/40"
                  >
                    <input
                      type="checkbox"
                      checked={smartLists.includes(l.key)}
                      onChange={() => toggleSmart(l.key)}
                      className="h-4 w-4 accent-orange"
                    />
                    {l.label}
                  </label>
                ))}
              </div>
            </div>

            {/* Segments ANCIENS (non-natifs importés) */}
            <div>
              <h2 className="font-display text-lg font-extrabold uppercase text-ink">
                Anciens adhérents
              </h2>
              <p className="mt-1 text-xs text-smoke">
                Classement automatique selon la saison en cours. Les anciens
                réinscrits et sans email sont exclus de l&apos;envoi.
              </p>
              <div className="mt-3 grid gap-2 sm:grid-cols-3">
                {SEGMENTS_ANCIENS.map((seg) => {
                  const saisonRef = saisonCourante(new Date());
                  const n = filtrerAnciens(
                    anciens,
                    [seg.key],
                    disciplines,
                    saisonRef,
                  ).filter((a) => a.has_email).length;
                  return (
                    <label
                      key={seg.key}
                      className="flex cursor-pointer items-start gap-2.5 rounded-xl border border-line p-3 text-sm hover:border-orange/40"
                    >
                      <input
                        type="checkbox"
                        checked={anciensSegments.includes(seg.key)}
                        onChange={() => toggleSegment(seg.key)}
                        className="mt-0.5 h-4 w-4 accent-orange"
                      />
                      <span>
                        {seg.label}
                        <span className="mt-0.5 block text-xs text-smoke">
                          {n} avec email
                        </span>
                      </span>
                    </label>
                  );
                })}
              </div>
              {/* Filtre discipline (OU), applicable aux segments anciens */}
              <div className="mt-3 flex flex-wrap items-center gap-2">
                <span className="text-xs font-semibold uppercase tracking-wide text-smoke">
                  Discipline :
                </span>
                {DISCIPLINES.map((d) => (
                  <label
                    key={d.key}
                    className={`flex cursor-pointer items-center gap-2 rounded-full border px-3 py-1.5 text-xs font-semibold ${
                      disciplines.includes(d.key)
                        ? "border-orange bg-orange-50 text-orange"
                        : "border-line text-ink hover:border-orange/40"
                    }`}
                  >
                    <input
                      type="checkbox"
                      checked={disciplines.includes(d.key)}
                      onChange={() => toggleDiscipline(d.key)}
                      className="h-3.5 w-3.5 accent-orange"
                    />
                    {d.label}
                  </label>
                ))}
                {disciplines.length > 0 && (
                  <button
                    onClick={() => setDisciplines([])}
                    className="text-xs font-semibold text-smoke underline-offset-2 hover:underline"
                  >
                    réinitialiser
                  </button>
                )}
              </div>
              {anciensSegments.length > 0 && anciensSansEmail > 0 && (
                <p className="mt-2 text-xs text-smoke">
                  {anciensSansEmail} ancien{anciensSansEmail > 1 ? "s" : ""} sans
                  email dans cette sélection (non joignable{anciensSansEmail > 1 ? "s" : ""} par mail).
                </p>
              )}
            </div>

            {/* Sélection manuelle + listes perso */}
            <div>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h2 className="font-display text-lg font-extrabold uppercase text-ink">
                  Listes personnalisées
                </h2>
                <button
                  onClick={() => setManualOpen((v) => !v)}
                  className="text-sm font-bold text-orange"
                >
                  {manualOpen ? "Masquer" : "Sélection manuelle"}
                </button>
              </div>
              {savedLists.length > 0 && (
                <div className="mt-2 flex flex-wrap gap-2">
                  {savedLists.map((l) => (
                    <button
                      key={l.nom}
                      onClick={() => useListe(l)}
                      className="rounded-full border border-line bg-paper-2 px-3 py-1 text-xs font-semibold text-ink hover:border-orange"
                    >
                      {l.nom} ({l.emails.length})
                    </button>
                  ))}
                </div>
              )}
              {manualOpen && (
                <div className="mt-3 rounded-xl border border-line p-3">
                  <input
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    placeholder="Rechercher un adhérent…"
                    className="focus-ring mb-2 w-full rounded-lg border border-line bg-paper-2 px-3 py-2 text-sm outline-none focus:border-orange"
                  />
                  <div className="max-h-56 space-y-1 overflow-y-auto">
                    {filteredAdherents.map((a) => (
                      <label
                        key={a.id}
                        className="flex cursor-pointer items-center gap-2 rounded-lg px-2 py-1.5 text-sm hover:bg-paper-2"
                      >
                        <input
                          type="checkbox"
                          checked={manualSelected.has(a.email)}
                          onChange={() => toggleManual(a.email)}
                          className="h-4 w-4 accent-orange"
                        />
                        <span className="truncate">
                          {a.prenom} {a.nom}{" "}
                          <span className="text-smoke">· {a.email}</span>
                        </span>
                      </label>
                    ))}
                  </div>
                  <button
                    onClick={saveListe}
                    disabled={manualSelected.size === 0}
                    className="mt-2 text-xs font-bold text-orange disabled:opacity-40"
                  >
                    Sauvegarder la sélection comme liste
                  </button>
                </div>
              )}
            </div>

            {/* Contacts importés */}
            <div>
              <h2 className="font-display text-lg font-extrabold uppercase text-ink">
                Contacts importés
              </h2>
              <div className="mt-3 flex flex-wrap items-center gap-3">
                <label className="flex cursor-pointer items-center gap-2.5 rounded-xl border border-line p-3 text-sm">
                  <input
                    type="checkbox"
                    checked={includeContacts}
                    onChange={(e) => setIncludeContacts(e.target.checked)}
                    className="h-4 w-4 accent-orange"
                  />
                  Inclure les {contactsCount} contacts importés
                </label>
                <button
                  onClick={importCsv}
                  className="rounded-full border border-line bg-white px-4 py-2 text-sm font-semibold text-ink hover:border-orange"
                >
                  Importer un CSV
                </button>
              </div>
            </div>

            <div className="rounded-xl bg-orange-50 p-4 text-sm font-semibold text-orange">
              {count} destinataire{count > 1 ? "s" : ""} sélectionné
              {count > 1 ? "s" : ""}
              {doublons > 0 ? ` (${doublons} doublon${doublons > 1 ? "s" : ""} supprimé${doublons > 1 ? "s" : ""})` : ""}
            </div>
          </div>
        )}

        {/* ÉTAPE 2 */}
        {step === 1 && (
          <div className="space-y-5">
            <label className="block">
              <span className="mb-1.5 block text-sm font-semibold text-ink">
                Objet
              </span>
              <input
                value={objet}
                onChange={(e) => setObjet(e.target.value)}
                placeholder="Objet de l'email"
                className="focus-ring w-full rounded-xl border border-line bg-paper-2 px-4 py-3 text-sm outline-none focus:border-orange"
              />
            </label>

            <label className="block">
              <span className="mb-1.5 block text-sm font-semibold text-ink">
                Template
              </span>
              <select
                onChange={(e) => applyTemplate(e.target.value)}
                className="focus-ring w-full rounded-xl border border-line bg-paper-2 px-4 py-3 text-sm outline-none focus:border-orange"
              >
                <option value="">Message libre (vide)</option>
                {templates.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.nom}
                    {t.est_defaut ? " (défaut)" : ""}
                  </option>
                ))}
              </select>
            </label>

            <div>
              <div className="mb-2 flex flex-wrap items-center gap-2">
                <span className="text-sm font-semibold text-ink">
                  Insérer une variable :
                </span>
                {VARIABLES.map((v) => (
                  <button
                    key={v.token}
                    onClick={() => insertVar(v.token)}
                    className="rounded-full border border-line bg-paper-2 px-2.5 py-1 text-xs font-semibold text-ink hover:border-orange"
                  >
                    {v.label}
                  </button>
                ))}
              </div>
              <textarea
                ref={contenuRef}
                rows={12}
                value={contenu}
                onChange={(e) => setContenu(e.target.value)}
                placeholder="Rédigez votre message… Utilisez {{prenom}}, {{nom}}, {{formule}}, {{montant}}."
                className="focus-ring w-full rounded-xl border border-line bg-paper-2 px-4 py-3 text-sm outline-none focus:border-orange"
              />
            </div>

            <div className="flex flex-wrap gap-3">
              <button
                onClick={() => setPreviewOpen(true)}
                className="rounded-full border border-line bg-white px-4 py-2 text-sm font-semibold text-ink hover:border-orange"
              >
                Aperçu
              </button>
              <button
                onClick={saveAsTemplate}
                disabled={!objet || !contenu}
                className="rounded-full border border-line bg-white px-4 py-2 text-sm font-semibold text-ink hover:border-orange disabled:opacity-40"
              >
                Sauvegarder comme template
              </button>
            </div>
          </div>
        )}

        {/* ÉTAPE 3 */}
        {step === 2 && (
          <div className="space-y-5">
            <h2 className="font-display text-lg font-extrabold uppercase text-ink">
              Récapitulatif
            </h2>
            <dl className="space-y-2 text-sm">
              <Row label="Objet" value={objet || "—"} />
              <Row label="Destinataires" value={`${count} personne${count > 1 ? "s" : ""}`} />
            </dl>
            <div>
              <p className="text-sm font-semibold text-ink">
                Aperçu des destinataires
              </p>
              <div className="mt-2 max-h-40 overflow-y-auto rounded-xl border border-line bg-paper-2 p-3 text-xs text-smoke">
                {recipientsAdh.length === 0 && !includeContacts ? (
                  <div>Aucun destinataire sélectionné.</div>
                ) : recipientsAdh.length <= 3 ? (
                  recipientsAdh.map((a) => (
                    <div key={a.id}>
                      <span className="font-semibold text-ink">
                        {a.prenom} {a.nom}
                      </span>{" "}
                      ({a.email})
                    </div>
                  ))
                ) : (
                  <div>
                    <span className="font-semibold text-ink">
                      {recipientsAdh
                        .slice(0, 3)
                        .map((a) => `${a.prenom} ${a.nom}`.trim())
                        .join(", ")}
                    </span>{" "}
                    +{recipientsAdh.length - 3} autre
                    {recipientsAdh.length - 3 > 1 ? "s" : ""}…
                  </div>
                )}
                {includeContacts && contactsCount > 0 && (
                  <div className="mt-1">
                    + {contactsCount} contact{contactsCount > 1 ? "s" : ""} importé
                    {contactsCount > 1 ? "s" : ""}
                  </div>
                )}
              </div>
            </div>

            <button
              onClick={() => setConfirmOpen(true)}
              disabled={count === 0 || !objet || !contenu}
              className="w-full rounded-full bg-orange px-6 py-3 text-sm font-bold text-white hover:bg-orange/90 disabled:opacity-50 sm:w-auto"
            >
              Envoyer maintenant
            </button>
          </div>
        )}

        {/* Navigation */}
        <div className="mt-8 flex items-center justify-between">
          {step > 0 ? (
            <button
              onClick={() => setStep((s) => s - 1)}
              className="text-sm font-semibold text-smoke hover:text-ink"
            >
              ← Retour
            </button>
          ) : (
            <span />
          )}
          {step < 2 && (
            <button
              onClick={() => setStep((s) => s + 1)}
              disabled={step === 0 && count === 0}
              className="rounded-full bg-ink px-6 py-2.5 text-sm font-bold text-white hover:bg-orange disabled:opacity-40"
            >
              Continuer
            </button>
          )}
        </div>
      </div>

      {/* Modal aperçu */}
      {previewOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink/40 p-4">
          <div className="max-h-[90vh] w-full max-w-md overflow-y-auto rounded-[1.5rem] bg-white p-6">
            <h2 className="font-display text-lg font-extrabold uppercase text-ink">
              Aperçu (données exemple)
            </h2>
            <p className="mt-3 text-sm font-bold text-ink">
              {remplacerVariables(objet, exampleVars) || "(objet vide)"}
            </p>
            <div className="mt-2 whitespace-pre-wrap rounded-xl border border-line bg-paper-2 p-4 text-sm text-ink">
              {remplacerVariables(contenu, exampleVars) || "(contenu vide)"}
            </div>
            <button
              onClick={() => setPreviewOpen(false)}
              className="mt-5 w-full rounded-full bg-ink px-5 py-2.5 text-sm font-bold text-white"
            >
              Fermer
            </button>
          </div>
        </div>
      )}

      {/* Confirmation envoi */}
      {confirmOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink/40 p-4">
          <div className="w-full max-w-md rounded-[1.5rem] bg-white p-6 text-center">
            {result ? (
              <>
                <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-green-100 text-2xl">
                  ✅
                </div>
                <h2 className="font-display mt-4 text-xl font-extrabold uppercase text-ink">
                  Campagne envoyée
                </h2>
                <dl className="mx-auto mt-4 max-w-xs space-y-2 text-sm">
                  <Row
                    label="Emails envoyés"
                    value={`${result.sent} destinataire${result.sent > 1 ? "s" : ""}`}
                  />
                  {result.doublons > 0 && (
                    <Row label="Doublons retirés" value={String(result.doublons)} />
                  )}
                  <Row
                    label="Désinscrits exclus"
                    value={String(result.exclus)}
                  />
                  {result.exclusSansEmail > 0 && (
                    <Row
                      label="Anciens sans email (exclus)"
                      value={String(result.exclusSansEmail)}
                    />
                  )}
                </dl>
                <button
                  onClick={() => router.push("/admin/campagnes")}
                  className="mt-6 rounded-full bg-orange px-6 py-2.5 text-sm font-bold text-white hover:bg-orange/90"
                >
                  Voir l&apos;historique
                </button>
              </>
            ) : (
              <>
                <h2 className="font-display text-xl font-extrabold uppercase text-ink">
                  Confirmer l&apos;envoi
                </h2>
                <p className="mt-3 text-sm text-smoke">
                  Vous allez envoyer cet email à <strong>{count}</strong> personne
                  {count > 1 ? "s" : ""}. Les désinscrits sont automatiquement
                  exclus. Cette action est irréversible.
                </p>
                <div className="mt-5 flex justify-center gap-3">
                  <button
                    onClick={() => setConfirmOpen(false)}
                    disabled={sending}
                    className="rounded-full border border-line px-5 py-2.5 text-sm font-semibold text-ink"
                  >
                    Annuler
                  </button>
                  <button
                    onClick={envoyer}
                    disabled={sending}
                    className="rounded-full bg-orange px-5 py-2.5 text-sm font-bold text-white hover:bg-orange/90 disabled:opacity-50"
                  >
                    {sending ? "Envoi…" : "Envoyer maintenant"}
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {toast && (
        <div className="fixed bottom-6 right-6 z-50 max-w-xs rounded-xl bg-ink px-5 py-3 text-sm font-bold text-white shadow-lg">
          {toast}
        </div>
      )}
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <dt className="text-smoke">{label}</dt>
      <dd className="font-semibold text-ink">{value}</dd>
    </div>
  );
}
