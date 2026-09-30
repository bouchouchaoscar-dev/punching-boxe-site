"use client";

import { useEffect, useMemo, useState } from "react";
import { DatePicker } from "@/components/ui/DatePicker";
import { presenceActif } from "@/lib/presence";
import { estEmailValide } from "@/lib/email-format";
import { estMineur } from "@/lib/pricing";
import { CLUB } from "@/lib/constants";

type CoursPublic = { id: string; libelle: string | null; discipline: string; public: string; horaire: string; salle: string | null };
type Resultat = { id: string; prenom: string; nom: string; annee?: number };

function salleInitiale(): string {
  if (typeof window === "undefined") return "";
  return new URLSearchParams(window.location.search).get("salle") || "";
}

export default function PresencePage() {
  const [salle] = useState(salleInitiale);
  const [ouverts, setOuverts] = useState<CoursPublic[]>([]);
  const [chargeOuverts, setChargeOuverts] = useState(false);
  const [mode, setMode] = useState<"adherent" | "essai">("adherent");
  const [confirmation, setConfirmation] = useState<{ coursLabel: string | null; essai?: boolean } | null>(null);

  useEffect(() => {
    if (!presenceActif()) return;
    fetch(`/api/presence/cours-ouverts?salle=${encodeURIComponent(salle)}`, { cache: "no-store" })
      .then((r) => r.json())
      .then((d) => setOuverts(d.cours ?? []))
      .catch(() => setOuverts([]))
      .finally(() => setChargeOuverts(true));
  }, [salle]);

  if (!presenceActif()) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-ink p-6 text-center text-white">
        Le pointage n&apos;est pas activé.
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-ink text-white">
      <div className="mx-auto flex min-h-screen max-w-md flex-col px-5 py-8">
        {/* En-tête */}
        <header className="text-center">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/logo/logo.png" alt={CLUB.nomCourt} className="mx-auto h-16 w-16 rounded-full object-cover" />
          <h1 className="mt-3 font-display text-2xl font-black uppercase tracking-wide">{CLUB.nomCourt}</h1>
          <div className="mt-3 rounded-2xl bg-white/5 p-3 text-left text-sm text-white/80">
            {!chargeOuverts ? (
              <p className="text-center text-white/50">…</p>
            ) : ouverts.length === 0 ? (
              <p className="text-center">Aucun cours en ce moment. Le pointage ouvre 30 minutes avant chaque cours.</p>
            ) : (
              <ul className="space-y-1">
                {ouverts.map((c) => (
                  <li key={c.id} className="flex items-center justify-between gap-2">
                    <span className="font-semibold text-white">{c.libelle}</span>
                    <span className="text-xs text-white/60">
                      {c.public} · {c.horaire}
                      {c.salle ? ` · ${c.salle}` : ""}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </header>

        <main className="mt-6 flex-1">
          {confirmation ? (
            <Confirmation data={confirmation} onReset={() => { setConfirmation(null); setMode("adherent"); }} />
          ) : mode === "adherent" ? (
            <VueAdherent salle={salle} onDone={(c) => setConfirmation(c)} />
          ) : (
            <VueEssai salle={salle} onDone={(c) => setConfirmation(c)} onBack={() => setMode("adherent")} />
          )}
        </main>

        {!confirmation && mode === "adherent" && (
          <button
            onClick={() => setMode("essai")}
            className="mt-6 rounded-full border border-white/20 py-3 text-center text-sm font-semibold text-white/80 hover:border-white/50"
          >
            C&apos;est ma séance d&apos;essai
          </button>
        )}
      </div>
    </div>
  );
}

function Confirmation({ data, onReset }: { data: { coursLabel: string | null; essai?: boolean }; onReset: () => void }) {
  useEffect(() => {
    const t = setTimeout(onReset, 6000);
    return () => clearTimeout(t);
  }, [onReset]);
  return (
    <div className="flex flex-col items-center justify-center rounded-3xl bg-orange/15 p-8 text-center">
      <div className="flex h-16 w-16 items-center justify-center rounded-full bg-orange text-3xl">✓</div>
      <p className="mt-4 text-xl font-bold">C&apos;est noté, bon entraînement !</p>
      {data.coursLabel && <p className="mt-1 text-white/70">{data.coursLabel}</p>}
      {data.essai && <p className="mt-3 text-sm text-white/60">Tu recevras un email si tu veux t&apos;inscrire.</p>}
      <button onClick={onReset} className="mt-6 rounded-full bg-white px-6 py-2 text-sm font-bold text-ink">
        Terminé
      </button>
    </div>
  );
}

// Choix du cours quand plusieurs sont possibles.
function ChoixCours({
  choix,
  selectionId,
  onValider,
  busy,
}: {
  choix: CoursPublic[];
  selectionId: string | null;
  onValider: (coursId: string) => void;
  busy: boolean;
}) {
  const [sel, setSel] = useState(selectionId ?? choix[0]?.id ?? "");
  return (
    <div className="mt-4">
      <p className="mb-2 text-sm font-semibold text-white/80">Quel cours ?</p>
      <div className="space-y-2">
        {choix.map((c) => (
          <button
            key={c.id}
            onClick={() => setSel(c.id)}
            className={`flex w-full items-center justify-between rounded-2xl border p-3 text-left ${
              sel === c.id ? "border-orange bg-orange/15" : "border-white/15 bg-white/5"
            }`}
          >
            <span className="font-semibold">{c.libelle}</span>
            <span className="text-xs text-white/60">{c.public} · {c.horaire}</span>
          </button>
        ))}
      </div>
      <button
        onClick={() => onValider(sel)}
        disabled={busy || !sel}
        className="mt-4 w-full rounded-full bg-orange py-3 font-bold text-white disabled:opacity-50"
      >
        {busy ? "…" : "Valider"}
      </button>
    </div>
  );
}

function VueAdherent({ salle, onDone }: { salle: string; onDone: (c: { coursLabel: string | null }) => void }) {
  const [q, setQ] = useState("");
  const [resultats, setResultats] = useState<Resultat[]>([]);
  const [dossierId, setDossierId] = useState<string | null>(null);
  const [choix, setChoix] = useState<{ cours: CoursPublic[]; selectionId: string | null } | null>(null);
  const [busy, setBusy] = useState(false);
  const [erreur, setErreur] = useState("");

  useEffect(() => {
    if (q.trim().length < 3) { setResultats([]); return; }
    const ctrl = new AbortController();
    const t = setTimeout(() => {
      fetch(`/api/presence/recherche?q=${encodeURIComponent(q.trim())}`, { cache: "no-store", signal: ctrl.signal })
        .then((r) => r.json())
        .then((d) => setResultats(d.resultats ?? []))
        .catch(() => {});
    }, 200);
    return () => { clearTimeout(t); ctrl.abort(); };
  }, [q]);

  async function pointer(id: string, coursId?: string) {
    setBusy(true);
    setErreur("");
    try {
      const r = await fetch("/api/presence/pointer", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ dossierId: id, coursId, salle }),
      });
      const d = await r.json();
      if (!r.ok) { setErreur(d.error || "Impossible d'enregistrer."); return; }
      if (d.choix) { setDossierId(id); setChoix({ cours: d.choix, selectionId: d.selectionId }); return; }
      onDone({ coursLabel: d.coursLabel });
    } finally {
      setBusy(false);
    }
  }

  if (choix && dossierId) {
    return <ChoixCours choix={choix.cours} selectionId={choix.selectionId} busy={busy} onValider={(cid) => pointer(dossierId, cid)} />;
  }

  return (
    <div>
      <label className="block text-sm font-semibold text-white/80">Tape les 3 premières lettres de ton nom</label>
      <input
        value={q}
        onChange={(e) => setQ(e.target.value)}
        autoFocus
        className="mt-2 w-full rounded-2xl border border-white/15 bg-white/10 px-4 py-3 text-lg text-white placeholder-white/40 outline-none focus:border-orange"
        placeholder="Nom…"
      />
      {erreur && <p className="mt-3 rounded-xl bg-red-500/20 p-3 text-sm text-red-200">{erreur}</p>}
      <ul className="mt-3 space-y-2">
        {resultats.map((r) => (
          <li key={r.id}>
            <button
              onClick={() => pointer(r.id)}
              disabled={busy}
              className="w-full rounded-2xl border border-white/15 bg-white/5 px-4 py-3 text-left text-lg font-semibold hover:border-orange disabled:opacity-50"
            >
              {r.prenom} {r.nom.toUpperCase()}
              {r.annee ? <span className="ml-2 text-sm font-normal text-white/50">{r.annee}</span> : null}
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}

function VueEssai({
  salle,
  onDone,
  onBack,
}: {
  salle: string;
  onDone: (c: { coursLabel: string | null; essai?: boolean }) => void;
  onBack: () => void;
}) {
  const [prenom, setPrenom] = useState("");
  const [nom, setNom] = useState("");
  const [dateNaissance, setDateNaissance] = useState("");
  const [email, setEmail] = useState("");
  const [choix, setChoix] = useState<{ cours: CoursPublic[]; selectionId: string | null } | null>(null);
  const [busy, setBusy] = useState(false);
  const [erreur, setErreur] = useState("");

  const mineur = useMemo(() => (dateNaissance ? estMineur(dateNaissance) : false), [dateNaissance]);
  const emailLabel = mineur ? "Email d'un parent ou du représentant légal" : "Ton email";
  const emailOk = email.length > 3 ? estEmailValide(email) : true;
  const pret = prenom.trim() && nom.trim() && dateNaissance && estEmailValide(email);

  async function envoyer(coursId?: string) {
    setBusy(true);
    setErreur("");
    try {
      const r = await fetch("/api/presence/essai", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prenom, nom, date_naissance: dateNaissance, email, coursId, salle }),
      });
      const d = await r.json();
      if (!r.ok) { setErreur(d.error || "Impossible d'enregistrer."); return; }
      if (d.choix) { setChoix({ cours: d.choix, selectionId: d.selectionId }); return; }
      onDone({ coursLabel: d.coursLabel, essai: !d.surDossier });
    } finally {
      setBusy(false);
    }
  }

  if (choix) {
    return <ChoixCours choix={choix.cours} selectionId={choix.selectionId} busy={busy} onValider={(cid) => envoyer(cid)} />;
  }

  return (
    <div className="space-y-3">
      <button onClick={onBack} className="text-sm font-semibold text-white/60 hover:text-white">← Je suis adhérent</button>
      <input value={prenom} onChange={(e) => setPrenom(e.target.value)} placeholder="Prénom" className="w-full rounded-2xl border border-white/15 bg-white/10 px-4 py-3 text-white placeholder-white/40 outline-none focus:border-orange" />
      <input value={nom} onChange={(e) => setNom(e.target.value)} placeholder="Nom" className="w-full rounded-2xl border border-white/15 bg-white/10 px-4 py-3 text-white placeholder-white/40 outline-none focus:border-orange" />
      <div className="rounded-2xl border border-white/15 bg-white/10 px-2 py-1 [color-scheme:dark]">
        <DatePicker label="Date de naissance" value={dateNaissance} onChange={setDateNaissance} />
      </div>
      <div>
        <label className="block text-sm font-semibold text-white/80">{emailLabel}</label>
        <input
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className="mt-1 w-full rounded-2xl border border-white/15 bg-white/10 px-4 py-3 text-white placeholder-white/40 outline-none focus:border-orange"
          placeholder="email@exemple.fr"
        />
        {!emailOk && <p className="mt-1 text-xs font-semibold text-red-300">Adresse email invalide</p>}
      </div>
      {erreur && <p className="rounded-xl bg-red-500/20 p-3 text-sm text-red-200">{erreur}</p>}
      <button onClick={() => envoyer()} disabled={busy || !pret} className="w-full rounded-full bg-orange py-3 font-bold text-white disabled:opacity-50">
        {busy ? "…" : "Valider ma présence"}
      </button>
      <p className="text-center text-xs text-white/50">
        En validant, tu acceptes de recevoir deux emails maximum du club au sujet de ton inscription.{" "}
        <a href="/politique-de-confidentialite" className="underline">Politique de confidentialité</a>.
      </p>
    </div>
  );
}
