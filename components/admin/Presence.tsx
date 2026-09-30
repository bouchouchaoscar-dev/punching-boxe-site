"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { adminAuthHeaders, getAdminRole } from "@/lib/admin-auth";
import { PageHeader } from "./PageHeader";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { PlanningSemaine } from "./PlanningSemaine";
import { IconButton } from "@/components/ui/IconButton";
import { DatePicker } from "@/components/ui/DatePicker";
import { Download } from "lucide-react";
import { estEmailValide } from "@/lib/email-format";
import { estMineur } from "@/lib/pricing";
import {
  toISODate,
  lundiDeLaSemaine,
  dateDuJour,
  couleurCours,
  type Cours,
  type PeriodeFermeture,
} from "@/lib/planning";
import { slugSalle } from "@/lib/presence";
import type { Situation } from "@/lib/presence-admin";

// Rappel : la COULEUR de statut vient de statutTrombi (source unique, calculée
// côté serveur et transmise en `couleur`). Ici, seul le mapping vers une classe.
const DOT_BG: Record<"vert" | "orange" | "rouge", string> = { vert: "bg-green-500", orange: "bg-orange", rouge: "bg-red-500" };

type Ligne = {
  presenceId: string;
  coursId: string;
  dateSeance: string;
  kind: "dossier" | "essai";
  dossierId?: string;
  essaiId?: string;
  prenom: string;
  nom: string;
  photo: string | null;
  couleur: "vert" | "orange" | "rouge" | null;
  statutLabel: string | null;
  situation: Situation;
  heure: string;
  essai: boolean;
  email?: string | null;
  relance1?: string | null;
  relance2?: string | null;
  converti?: boolean;
};
type Bloc = {
  id: string;
  libelle: string | null;
  discipline: string;
  public: string;
  horaire: string;
  salle: string | null;
  dateISO: string;
  ouvert: boolean;
  nbPresents: number;
  compteurs: Record<Situation, number>;
  lignes: Ligne[];
};

const SIT_LABEL: Record<Situation, string> = {
  regle: "Réglé",
  especes: "Espèces en attente",
  non_finalise: "Paiement non finalisé",
  incomplet: "Dossier incomplet",
  essai: "Essai",
};

export function Presence() {
  const [role, setRole] = useState<string | null>(null);
  useEffect(() => setRole(getAdminRole()), []);
  if (role === "coach") return <PresenceCoach />;
  return <PresenceAdmin />;
}

// ---------------------------------------------------------------------------
// ADMIN
// ---------------------------------------------------------------------------
function PresenceAdmin() {
  const [vue, setVue] = useState<"aujourdhui" | "historique">("aujourdhui");
  const [affichesOpen, setAffichesOpen] = useState(false);

  return (
    <div className="max-w-5xl">
      <PageHeader
        title="Présence"
        description="Qui est dans la salle et où en est chacun de son inscription. Pointage par QR code, séances d'essai avec relances."
        actions={
          <IconButton icon={<Download className="h-5 w-5" />} label="Affiches QR à imprimer" onClick={() => setAffichesOpen(true)} />
        }
      />

      <div className="mt-6 inline-flex rounded-full border border-line bg-white p-0.5">
        {(["aujourdhui", "historique"] as const).map((v) => (
          <button
            key={v}
            onClick={() => setVue(v)}
            className={`rounded-full px-4 py-1.5 text-sm font-semibold ${vue === v ? "bg-ink text-white" : "text-ink/70"}`}
          >
            {v === "aujourdhui" ? "Aujourd'hui" : "Historique"}
          </button>
        ))}
      </div>

      <div className="mt-6">{vue === "aujourdhui" ? <VueAujourdhui /> : <VueHistorique />}</div>

      {affichesOpen && <AffichesModal onClose={() => setAffichesOpen(false)} />}
    </div>
  );
}

function VueAujourdhui() {
  const [blocs, setBlocs] = useState<Bloc[] | null>(null);
  const [filtre, setFiltre] = useState<Situation | null>(null);
  const [detailEssai, setDetailEssai] = useState<Ligne | null>(null);
  const [aRetirer, setARetirer] = useState<Ligne | null>(null);
  const [busy, setBusy] = useState(false);
  const [ajout, setAjout] = useState<Bloc | null>(null);

  const charger = useCallback(() => {
    fetch("/api/admin/presence/jour", { headers: adminAuthHeaders(), cache: "no-store" })
      .then((r) => r.json())
      .then((d) => setBlocs(d.cours ?? []))
      .catch(() => {});
  }, []);
  useEffect(() => {
    charger();
    const t = setInterval(charger, 30_000); // rafraîchissement auto, sans saut
    return () => clearInterval(t);
  }, [charger]);

  async function retirer() {
    if (!aRetirer) return;
    setBusy(true);
    try {
      await fetch("/api/admin/presence/retirer", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...adminAuthHeaders() },
        body: JSON.stringify({ presenceId: aRetirer.presenceId }),
      });
      setARetirer(null);
      charger();
    } finally {
      setBusy(false);
    }
  }

  if (blocs === null) return <Squelette />;
  if (blocs.length === 0) return <p className="rounded-2xl border border-dashed border-line bg-white p-8 text-center text-sm text-smoke">Aucun cours aujourd&apos;hui.</p>;

  return (
    <div className="space-y-4">
      {blocs.map((b) => (
        <BlocCours key={b.id} bloc={b} filtre={filtre} onFiltre={setFiltre} onRetirer={setARetirer} onDetailEssai={setDetailEssai} onAjouter={() => setAjout(b)} />
      ))}

      {detailEssai && <DetailEssaiModal ligne={detailEssai} onClose={() => setDetailEssai(null)} />}
      {ajout && <AjouterPresentModal bloc={ajout} onClose={() => setAjout(null)} onAjoute={() => { setAjout(null); charger(); }} />}
      {aRetirer && (
        <ConfirmDialog
          title="Retirer cette présence ?"
          message={`${aRetirer.prenom} ${aRetirer.nom} ne sera plus compté(e) sur cette séance.`}
          confirmLabel="Retirer"
          variant="danger"
          busy={busy}
          onCancel={() => setARetirer(null)}
          onConfirm={retirer}
        />
      )}
    </div>
  );
}

function BlocCours({
  bloc,
  filtre,
  onFiltre,
  onRetirer,
  onDetailEssai,
  onAjouter,
}: {
  bloc: Bloc;
  filtre: Situation | null;
  onFiltre: (s: Situation | null) => void;
  onRetirer: (l: Ligne) => void;
  onDetailEssai: (l: Ligne) => void;
  onAjouter: () => void;
}) {
  const lignes = filtre ? bloc.lignes.filter((l) => l.situation === filtre) : bloc.lignes;
  return (
    <div className="rounded-[1.5rem] border border-line bg-white p-4 sm:p-5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <h3 className="font-display text-lg font-extrabold uppercase text-ink">{bloc.libelle}</h3>
            {bloc.ouvert && <span className="rounded-full bg-green-100 px-2 py-0.5 text-[11px] font-bold text-green-700">En cours</span>}
          </div>
          <p className="text-sm text-smoke">{bloc.horaire}{bloc.salle ? ` · ${bloc.salle}` : ""} · {bloc.public}</p>
        </div>
        <div className="text-right">
          <div className="font-display text-4xl font-black leading-none text-ink">{bloc.nbPresents}</div>
          <div className="text-[11px] uppercase tracking-wide text-smoke">présent{bloc.nbPresents > 1 ? "s" : ""}</div>
        </div>
      </div>

      {/* Compteurs par situation, cliquables (filtre). */}
      <div className="mt-3 flex flex-wrap gap-1.5">
        {(Object.keys(SIT_LABEL) as Situation[]).map((s) =>
          bloc.compteurs[s] > 0 ? (
            <button
              key={s}
              onClick={() => onFiltre(filtre === s ? null : s)}
              className={`rounded-full border px-2.5 py-1 text-xs font-semibold ${filtre === s ? "border-orange bg-orange-50 text-orange" : "border-line text-ink/70"}`}
            >
              {SIT_LABEL[s]} · {bloc.compteurs[s]}
            </button>
          ) : null,
        )}
      </div>

      <ul className="mt-3 divide-y divide-line">
        {lignes.map((l) => (
          <LigneRow key={l.presenceId} l={l} onRetirer={() => onRetirer(l)} onDetailEssai={() => onDetailEssai(l)} />
        ))}
        {lignes.length === 0 && <li className="py-3 text-center text-sm text-smoke">Personne pour ce filtre.</li>}
      </ul>

      <button onClick={onAjouter} className="mt-3 rounded-full border border-line px-4 py-2 text-sm font-semibold text-ink hover:border-orange">
        + Ajouter un présent
      </button>
    </div>
  );
}

function LigneRow({ l, onRetirer, onDetailEssai }: { l: Ligne; onRetirer: () => void; onDetailEssai: () => void }) {
  const contenu = (
    <div className="flex items-center gap-3">
      <span className="flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-full bg-paper-2 text-xs font-bold text-smoke">
        {l.photo ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={l.photo} alt="" className="h-full w-full object-cover" />
        ) : (
          `${l.prenom[0] ?? ""}${l.nom[0] ?? ""}`
        )}
      </span>
      <div className="min-w-0 flex-1">
        <p className="truncate font-semibold text-ink">
          {l.prenom} {l.nom.toUpperCase()}
        </p>
        <p className="flex items-center gap-1.5 text-xs text-smoke">
          {l.essai ? (
            <span className="rounded-full bg-blue-50 px-1.5 py-0.5 font-bold text-blue-700">Essai</span>
          ) : l.couleur ? (
            <>
              <span className={`h-2 w-2 rounded-full ${DOT_BG[l.couleur]}`} />
              {l.statutLabel}
            </>
          ) : null}
          <span className="text-smoke/60">· {l.heure}</span>
        </p>
      </div>
    </div>
  );
  return (
    <li className="flex items-center gap-2 py-2">
      <div className="min-w-0 flex-1">
        {l.essai ? (
          <button onClick={onDetailEssai} className="w-full text-left">{contenu}</button>
        ) : (
          <Link href={`/admin/adherents/${l.dossierId}`}>{contenu}</Link>
        )}
      </div>
      <button onClick={onRetirer} aria-label="Retirer" className="shrink-0 rounded-full px-2 py-1 text-smoke hover:text-red-600">×</button>
    </li>
  );
}

function VueHistorique() {
  const [semaineISO, setSemaineISO] = useState(() => toISODate(lundiDeLaSemaine(new Date())));
  const [cours, setCours] = useState<Cours[]>([]);
  const [periodes, setPeriodes] = useState<PeriodeFermeture[]>([]);
  const [counts, setCounts] = useState<Record<string, number>>({});
  const [seance, setSeance] = useState<{ coursId: string; date: string } | null>(null);

  useEffect(() => {
    fetch("/api/admin/planning/cours", { headers: adminAuthHeaders(), cache: "no-store" }).then((r) => r.json()).then((d) => setCours(d.cours ?? [])).catch(() => {});
    fetch("/api/admin/planning/fermetures", { headers: adminAuthHeaders(), cache: "no-store" }).then((r) => r.json()).then((d) => setPeriodes(d.periodes ?? [])).catch(() => {});
  }, []);
  useEffect(() => {
    fetch(`/api/admin/presence/semaine?semaine=${semaineISO}`, { headers: adminAuthHeaders(), cache: "no-store" })
      .then((r) => r.json())
      .then((d) => setCounts(d.counts ?? {}))
      .catch(() => {});
  }, [semaineISO]);

  const decaler = (delta: number) => setSemaineISO((s) => toISODate(lundiDeLaSemaine(dateDuJour(s, 1 + delta))));

  return (
    <div className="rounded-[1.5rem] border border-line bg-white p-4 sm:p-6">
      <PlanningSemaine
        semaineISO={semaineISO}
        cours={cours.filter((c) => c.actif)}
        affectations={[]}
        profs={[]}
        periodes={periodes}
        readOnly
        onPrev={() => decaler(-7)}
        onNext={() => decaler(7)}
        onToday={() => setSemaineISO(toISODate(lundiDeLaSemaine(new Date())))}
        renderCarte={(c) => {
          const date = toISODate(dateDuJour(semaineISO, c.jour_semaine ?? 1));
          const n = counts[`${c.id}|${date}`] ?? 0;
          const col = couleurCours(c.discipline, c.type_adherent);
          return (
            <button
              onClick={() => setSeance({ coursId: c.id, date })}
              style={{ backgroundColor: col.bg, borderLeftColor: col.bar }}
              className="flex min-h-[4.25rem] w-full flex-col rounded-lg border border-l-4 border-line/60 px-2 py-1.5 text-left"
            >
              <span className="text-[12px] font-bold leading-tight text-ink">{c.libelle}</span>
              <span className="mt-auto text-[11px] text-ink/70">{n} présent{n > 1 ? "s" : ""}</span>
            </button>
          );
        }}
      />
      {seance && <SeanceModal coursId={seance.coursId} date={seance.date} onClose={() => setSeance(null)} />}
    </div>
  );
}

function SeanceModal({ coursId, date, onClose }: { coursId: string; date: string; onClose: () => void }) {
  const [bloc, setBloc] = useState<Bloc | null | undefined>(undefined);
  useEffect(() => {
    fetch(`/api/admin/presence/jour?date=${date}`, { headers: adminAuthHeaders(), cache: "no-store" })
      .then((r) => r.json())
      .then((d) => setBloc((d.cours ?? []).find((b: Bloc) => b.id === coursId) ?? null))
      .catch(() => setBloc(null));
  }, [coursId, date]);
  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-ink/40 p-4" onClick={onClose}>
      <div className="max-h-[85vh] w-full max-w-md overflow-y-auto rounded-[1.5rem] bg-white p-5" onClick={(e) => e.stopPropagation()}>
        {bloc === undefined ? (
          <p className="py-8 text-center text-sm text-smoke">…</p>
        ) : !bloc ? (
          <p className="py-8 text-center text-sm text-smoke">Aucune donnée.</p>
        ) : (
          <>
            <h3 className="font-display text-lg font-extrabold uppercase text-ink">{bloc.libelle}</h3>
            <p className="text-sm text-smoke">{new Date(date).toLocaleDateString("fr-FR", { dateStyle: "long" })} · {bloc.horaire} · {bloc.nbPresents} présent{bloc.nbPresents > 1 ? "s" : ""}</p>
            <ul className="mt-3 divide-y divide-line">
              {bloc.lignes.map((l) => (
                <li key={l.presenceId} className="flex items-center gap-3 py-2">
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center overflow-hidden rounded-full bg-paper-2 text-xs font-bold text-smoke">
                    {l.photo ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={l.photo} alt="" className="h-full w-full object-cover" />
                    ) : (
                      `${l.prenom[0] ?? ""}${l.nom[0] ?? ""}`
                    )}
                  </span>
                  <span className="flex-1 truncate text-sm font-semibold text-ink">{l.prenom} {l.nom.toUpperCase()}</span>
                  {l.essai ? (
                    <span className="rounded-full bg-blue-50 px-1.5 py-0.5 text-[11px] font-bold text-blue-700">Essai</span>
                  ) : l.couleur ? (
                    <span className={`h-2.5 w-2.5 rounded-full ${DOT_BG[l.couleur]}`} />
                  ) : null}
                </li>
              ))}
              {bloc.lignes.length === 0 && <li className="py-3 text-center text-sm text-smoke">Aucun présent.</li>}
            </ul>
          </>
        )}
        <button onClick={onClose} className="mt-4 w-full rounded-full border border-line px-5 py-2.5 text-sm font-semibold text-ink">Fermer</button>
      </div>
    </div>
  );
}

function DetailEssaiModal({ ligne, onClose }: { ligne: Ligne; onClose: () => void }) {
  const relance = (v?: string | null) => (v ? new Date(v).toLocaleDateString("fr-FR") : "—");
  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-ink/40 p-4" onClick={onClose}>
      <div className="w-full max-w-sm rounded-[1.5rem] bg-white p-5" onClick={(e) => e.stopPropagation()}>
        <span className="rounded-full bg-blue-50 px-2 py-0.5 text-[11px] font-bold text-blue-700">Séance d&apos;essai</span>
        <h3 className="mt-2 font-display text-lg font-extrabold uppercase text-ink">{ligne.prenom} {ligne.nom.toUpperCase()}</h3>
        <dl className="mt-3 space-y-1.5 text-sm">
          <div className="flex justify-between gap-2"><dt className="text-smoke">Email</dt><dd className="text-ink [overflow-wrap:anywhere]">{ligne.email || "—"}</dd></div>
          <div className="flex justify-between gap-2"><dt className="text-smoke">Relance 1</dt><dd className="text-ink">{relance(ligne.relance1)}</dd></div>
          <div className="flex justify-between gap-2"><dt className="text-smoke">Relance 2</dt><dd className="text-ink">{relance(ligne.relance2)}</dd></div>
          <div className="flex justify-between gap-2"><dt className="text-smoke">Inscrit(e)</dt><dd className="text-ink">{ligne.converti ? "Oui ✓" : "Pas encore"}</dd></div>
        </dl>
        <button onClick={onClose} className="mt-4 w-full rounded-full border border-line px-5 py-2.5 text-sm font-semibold text-ink">Fermer</button>
      </div>
    </div>
  );
}

function AjouterPresentModal({ bloc, onClose, onAjoute }: { bloc: Bloc; onClose: () => void; onAjoute: () => void }) {
  const [mode, setMode] = useState<"adherent" | "essai">("adherent");
  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-ink/40 p-4" onClick={onClose}>
      <div className="max-h-[85vh] w-full max-w-sm overflow-y-auto rounded-[1.5rem] bg-white p-5" onClick={(e) => e.stopPropagation()}>
        <h3 className="font-display text-lg font-extrabold uppercase text-ink">Ajouter un présent</h3>
        <p className="text-sm text-smoke">{bloc.libelle} · {bloc.horaire}</p>

        <div className="mt-3 inline-flex rounded-full border border-line bg-white p-0.5">
          {(["adherent", "essai"] as const).map((m) => (
            <button key={m} onClick={() => setMode(m)} className={`rounded-full px-3 py-1.5 text-sm font-semibold ${mode === m ? "bg-ink text-white" : "text-ink/70"}`}>
              {m === "adherent" ? "Un adhérent" : "Une séance d'essai"}
            </button>
          ))}
        </div>

        {mode === "adherent" ? (
          <AjoutAdherent bloc={bloc} onAjoute={onAjoute} />
        ) : (
          <AjoutEssai bloc={bloc} onAjoute={onAjoute} />
        )}

        <button onClick={onClose} className="mt-4 w-full rounded-full border border-line px-5 py-2.5 text-sm font-semibold text-ink">Fermer</button>
      </div>
    </div>
  );
}

function AjoutAdherent({ bloc, onAjoute }: { bloc: Bloc; onAjoute: () => void }) {
  const [q, setQ] = useState("");
  const [res, setRes] = useState<{ id: string; prenom: string; nom: string; annee?: number }[]>([]);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (q.trim().length < 3) { setRes([]); return; }
    const t = setTimeout(() => {
      fetch(`/api/presence/recherche?q=${encodeURIComponent(q.trim())}`, { cache: "no-store" }).then((r) => r.json()).then((d) => setRes(d.resultats ?? [])).catch(() => {});
    }, 200);
    return () => clearTimeout(t);
  }, [q]);
  async function ajouter(dossierId: string) {
    setBusy(true);
    try {
      await fetch("/api/admin/presence/ajouter", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...adminAuthHeaders() },
        body: JSON.stringify({ coursId: bloc.id, date: bloc.dateISO, dossierId }),
      });
      onAjoute();
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <input value={q} onChange={(e) => setQ(e.target.value)} autoFocus placeholder="3 lettres du nom…" className="focus-ring mt-3 w-full rounded-xl border border-line bg-white px-4 py-2.5 text-sm outline-none focus:border-orange" />
      <ul className="mt-2 max-h-56 space-y-1 overflow-y-auto">
        {res.map((r) => (
          <li key={r.id}>
            <button disabled={busy} onClick={() => ajouter(r.id)} className="w-full rounded-lg border border-line px-3 py-2 text-left text-sm hover:border-orange disabled:opacity-50">
              {r.prenom} {r.nom.toUpperCase()}{r.annee ? ` · ${r.annee}` : ""}
            </button>
          </li>
        ))}
      </ul>
    </>
  );
}

function AjoutEssai({ bloc, onAjoute }: { bloc: Bloc; onAjoute: () => void }) {
  const [prenom, setPrenom] = useState("");
  const [nom, setNom] = useState("");
  const [dob, setDob] = useState("");
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [erreur, setErreur] = useState("");
  const mineur = dob ? estMineur(dob) : false;
  const emailLabel = mineur ? "Email d'un parent ou du représentant légal" : "Email";
  const emailOk = email.length > 3 ? estEmailValide(email) : true;
  const pret = prenom.trim() && nom.trim() && dob && estEmailValide(email);

  async function valider() {
    setBusy(true);
    setErreur("");
    try {
      const r = await fetch("/api/admin/presence/essai", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...adminAuthHeaders() },
        body: JSON.stringify({ coursId: bloc.id, date: bloc.dateISO, prenom, nom, date_naissance: dob, email }),
      });
      const d = await r.json();
      if (!r.ok) { setErreur(d.error || "Enregistrement impossible."); return; }
      onAjoute();
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mt-3 space-y-2">
      <input value={prenom} onChange={(e) => setPrenom(e.target.value)} placeholder="Prénom" className="focus-ring w-full rounded-xl border border-line bg-white px-4 py-2.5 text-sm outline-none focus:border-orange" />
      <input value={nom} onChange={(e) => setNom(e.target.value)} placeholder="Nom" className="focus-ring w-full rounded-xl border border-line bg-white px-4 py-2.5 text-sm outline-none focus:border-orange" />
      <DatePicker label="Date de naissance" value={dob} onChange={setDob} />
      <div>
        <label className="block text-xs font-bold uppercase tracking-wide text-smoke">{emailLabel}</label>
        <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="email@exemple.fr" className="focus-ring mt-1 w-full rounded-xl border border-line bg-white px-4 py-2.5 text-sm outline-none focus:border-orange" />
        {!emailOk && <p className="mt-1 text-xs font-semibold text-red-600">Adresse email invalide</p>}
      </div>
      {erreur && <p className="rounded-xl bg-red-50 p-2.5 text-sm text-red-700">{erreur}</p>}
      <button onClick={valider} disabled={busy || !pret} className="w-full rounded-full bg-orange py-2.5 text-sm font-bold text-white disabled:opacity-40">
        {busy ? "…" : "Ajouter la séance d'essai"}
      </button>
    </div>
  );
}

function AffichesModal({ onClose }: { onClose: () => void }) {
  const [salles, setSalles] = useState<string[]>([]);
  useEffect(() => {
    fetch("/api/admin/planning/cours", { headers: adminAuthHeaders(), cache: "no-store" })
      .then((r) => r.json())
      .then((d) => {
        const set = new Set<string>();
        for (const c of d.cours ?? []) if (c.salle) set.add(c.salle as string);
        setSalles([...set].sort());
      })
      .catch(() => {});
  }, []);
  const [err, setErr] = useState("");
  async function ouvrir(slug: string) {
    setErr("");
    const r = await fetch(`/api/admin/presence/affiche${slug ? `?salle=${encodeURIComponent(slug)}` : ""}`, { headers: adminAuthHeaders() });
    if (!r.ok) {
      setErr((await r.text().catch(() => "")) || "Génération impossible.");
      return;
    }
    const blob = await r.blob();
    window.open(URL.createObjectURL(blob), "_blank");
  }
  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-ink/40 p-4" onClick={onClose}>
      <div className="w-full max-w-sm rounded-[1.5rem] bg-white p-5" onClick={(e) => e.stopPropagation()}>
        <h3 className="font-display text-lg font-extrabold uppercase text-ink">Affiches QR</h3>
        <p className="text-sm text-smoke">Une affiche par salle (QR de pointage) + une générique.</p>
        <div className="mt-3 space-y-2">
          {salles.map((s) => (
            <button key={s} onClick={() => ouvrir(slugSalle(s))} className="w-full rounded-xl border border-line px-4 py-2.5 text-left text-sm font-semibold text-ink hover:border-orange">
              {s}
            </button>
          ))}
          <button onClick={() => ouvrir("")} className="w-full rounded-xl border border-dashed border-line px-4 py-2.5 text-left text-sm font-semibold text-ink hover:border-orange">
            Affiche générique (sans salle)
          </button>
        </div>
        {err && <p className="mt-3 rounded-xl bg-red-50 p-3 text-sm font-semibold text-red-700">{err}</p>}
        <button onClick={onClose} className="mt-4 w-full rounded-full border border-line px-5 py-2.5 text-sm font-semibold text-ink">Fermer</button>
      </div>
    </div>
  );
}

function Squelette() {
  return (
    <div className="space-y-4">
      {[0, 1].map((i) => (
        <div key={i} className="h-40 animate-pulse rounded-[1.5rem] border border-line bg-white" />
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// COACH (lecture seule, aujourd'hui)
// ---------------------------------------------------------------------------
type LigneCoach = { prenom: string; nom: string; couleur: "vert" | "orange" | "rouge" | null; essai: boolean; heure: string; photo: string | null };
type BlocCoach = { id: string; libelle: string | null; discipline: string; public: string; horaire: string; salle: string | null; nbPresents: number; lignes: LigneCoach[] };

function PresenceCoach() {
  const [blocs, setBlocs] = useState<BlocCoach[] | null>(null);
  const charger = useCallback(() => {
    fetch("/api/coach/presence", { headers: adminAuthHeaders(), cache: "no-store" }).then((r) => r.json()).then((d) => setBlocs(d.cours ?? [])).catch(() => {});
  }, []);
  useEffect(() => {
    charger();
    const t = setInterval(charger, 30_000);
    return () => clearInterval(t);
  }, [charger]);
  return (
    <div className="max-w-5xl">
      <PageHeader title="Présence" description="Qui est dans la salle aujourd'hui (lecture seule)." />
      <div className="mt-6 space-y-4">
        {blocs === null ? (
          <Squelette />
        ) : blocs.length === 0 ? (
          <p className="rounded-2xl border border-dashed border-line bg-white p-8 text-center text-sm text-smoke">Aucun cours aujourd&apos;hui.</p>
        ) : (
          blocs.map((b) => (
            <div key={b.id} className="rounded-[1.5rem] border border-line bg-white p-4 sm:p-5">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h3 className="font-display text-lg font-extrabold uppercase text-ink">{b.libelle}</h3>
                  <p className="text-sm text-smoke">{b.horaire}{b.salle ? ` · ${b.salle}` : ""} · {b.public}</p>
                </div>
                <div className="text-right">
                  <div className="font-display text-4xl font-black leading-none text-ink">{b.nbPresents}</div>
                  <div className="text-[11px] uppercase tracking-wide text-smoke">présent{b.nbPresents > 1 ? "s" : ""}</div>
                </div>
              </div>
              <ul className="mt-3 divide-y divide-line">
                {b.lignes.map((l, i) => (
                  <li key={i} className="flex items-center gap-3 py-2">
                    <span className="flex h-9 w-9 shrink-0 items-center justify-center overflow-hidden rounded-full bg-paper-2 text-xs font-bold text-smoke">
                      {l.photo ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={l.photo} alt="" className="h-full w-full object-cover" />
                      ) : (
                        `${l.prenom[0] ?? ""}${l.nom[0] ?? ""}`
                      )}
                    </span>
                    <span className="flex-1 truncate text-sm font-semibold text-ink">{l.prenom} {l.nom.toUpperCase()}</span>
                    {l.essai ? (
                      <span className="rounded-full bg-blue-50 px-1.5 py-0.5 text-[11px] font-bold text-blue-700">Essai</span>
                    ) : l.couleur ? (
                      <span className={`h-2.5 w-2.5 rounded-full ${DOT_BG[l.couleur]}`} />
                    ) : null}
                  </li>
                ))}
              </ul>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
