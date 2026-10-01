"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ChevronDown } from "lucide-react";
import { adminAuthHeaders, getAdminRole } from "@/lib/admin-auth";
import { CLES } from "@/lib/admin-cache";
import { useDonneesAdmin } from "./useDonneesAdmin";
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

// Rappel : la COULEUR de statut vient de statutTrombi (SOURCE UNIQUE, côté
// serveur). Ici, seul le mapping couleur → classe visuelle.
const DOT_BG: Record<"vert" | "orange" | "rouge", string> = { vert: "bg-green-500", orange: "bg-orange", rouge: "bg-red-500" };

type Categorie = "regle" | "especes" | "non_finalise" | "incomplet" | "essai" | "essai_utilise" | "hors_formule";
const CAT_LABEL: Record<Categorie, string> = {
  regle: "Réglé", especes: "Espèces en attente", non_finalise: "Paiement à finaliser",
  incomplet: "Dossier incomplet", essai: "Essai", essai_utilise: "Essai déjà utilisé", hors_formule: "Hors formule",
};
// Ordre d'affichage des filtres : situations à traiter d'abord.
const CAT_ORDER: Categorie[] = ["non_finalise", "especes", "incomplet", "essai", "essai_utilise", "hors_formule", "regle"];

type Ligne = {
  presenceId: string;
  coursId: string;
  dateSeance?: string;
  kind: "dossier" | "essai";
  dossierId?: string;
  essaiId?: string;
  prenom: string;
  nom: string;
  photo: string | null;
  couleur: "vert" | "orange" | "rouge" | null;
  statutLabel: string;
  cat: "regle" | "especes" | "non_finalise" | null;
  incomplet: boolean;
  essai: boolean;
  essaiDejaUtilise: boolean;
  horsFormule: boolean;
  heure: string;
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
  dateISO?: string;
  ouvert?: boolean;
  nbPresents: number;
  compteurs: Record<Categorie, number>;
  lignes: Ligne[];
};

function ligneDansCat(l: Ligne, cat: Categorie): boolean {
  switch (cat) {
    case "essai": return l.essai;
    case "essai_utilise": return l.essai && l.essaiDejaUtilise;
    case "incomplet": return !l.essai && l.incomplet;
    case "hors_formule": return !l.essai && l.horsFormule;
    default: return !l.essai && l.cat === cat;
  }
}

export function Presence() {
  const [role, setRole] = useState<string | null>(null);
  useEffect(() => setRole(getAdminRole()), []);
  if (role === "coach") return <PresenceVue readOnly />;
  return <PresenceAdmin />;
}

function PresenceAdmin() {
  const [vue, setVue] = useState<"aujourdhui" | "historique">("aujourdhui");
  const [affichesOpen, setAffichesOpen] = useState(false);
  return (
    <div className="max-w-5xl">
      <PageHeader
        title="Présence"
        description="Qui est dans la salle et où en est chacun de son inscription. Pointage par QR code, séances d'essai avec relances."
        actions={<IconButton icon={<Download className="h-5 w-5" />} label="Affiches QR à imprimer" onClick={() => setAffichesOpen(true)} />}
      />
      <div className="mt-6 inline-flex rounded-full border border-line bg-white p-0.5">
        {(["aujourdhui", "historique"] as const).map((v) => (
          <button key={v} onClick={() => setVue(v)} className={`rounded-full px-4 py-1.5 text-sm font-semibold ${vue === v ? "bg-ink text-white" : "text-ink/70"}`}>
            {v === "aujourdhui" ? "Aujourd'hui" : "Historique"}
          </button>
        ))}
      </div>
      <div className="mt-6">{vue === "aujourdhui" ? <PresenceVue /> : <VueHistorique />}</div>
      {affichesOpen && <AffichesModal onClose={() => setAffichesOpen(false)} />}
    </div>
  );
}

// Vue « Aujourd'hui » partagée admin/coach (readOnly). Le coach n'a ni
// ajout/retrait, ni lien fiche, ni détail essai (email).
function PresenceVue({ readOnly = false }: { readOnly?: boolean }) {
  const [filtres, setFiltres] = useState<Record<string, Categorie | null>>({});
  const [ouverts, setOuverts] = useState<Record<string, boolean>>({});
  const [detailEssai, setDetailEssai] = useState<Ligne | null>(null);
  const [aRetirer, setARetirer] = useState<Ligne | null>(null);
  const [ajout, setAjout] = useState<Bloc | null>(null);
  const [busy, setBusy] = useState(false);

  // Cache de session : paint instantané des derniers présents, puis
  // rafraîchissement IMMÉDIAT (dans la seconde) + auto toutes les 30 s. Le
  // compteur affiché depuis le cache est donc réactualisé aussitôt (jamais
  // présenté comme « à jour » alors qu'il serait périmé).
  const url = readOnly ? "/api/coach/presence" : "/api/admin/presence/jour";
  const cle = readOnly ? CLES.presenceCoach : CLES.presenceJour;
  const { data: blocs, error, refresh: charger } = useDonneesAdmin<Bloc[]>(
    cle,
    url,
    (d) => ((d as { cours?: Bloc[] }).cours ?? []),
    { intervalMs: 30_000 },
  );

  function setFiltre(coursId: string, cat: Categorie | null) {
    setFiltres((f) => ({ ...f, [coursId]: cat }));
    if (cat) setOuverts((o) => ({ ...o, [coursId]: true })); // toucher un filtre ouvre la liste
  }
  function toggleOuvert(coursId: string) {
    setOuverts((o) => ({ ...o, [coursId]: !o[coursId] }));
  }

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

  // Pas encore de données : erreur → on AFFICHE l'erreur (jamais un état vide
  // trompeur) ; sinon squelette. Données en cache + erreur au rafraîchissement →
  // on garde les données et on signale l'erreur en tête (note discrète).
  if (blocs === null) return error ? <ErreurPresence message={error} onRetry={charger} /> : <Squelette />;

  return (
    <div className="space-y-4">
      {error && <ErreurPresence message={error} onRetry={charger} inline />}
      {blocs.length === 0 ? (
        <p className="rounded-2xl border border-dashed border-line bg-white p-8 text-center text-sm text-smoke">Aucun cours aujourd&apos;hui.</p>
      ) : blocs.map((b) => (
        <BlocCours
          key={b.id}
          bloc={b}
          readOnly={readOnly}
          filtre={filtres[b.id] ?? null}
          open={ouverts[b.id] ?? false}
          onFiltre={(cat) => setFiltre(b.id, cat)}
          onToggleOpen={() => toggleOuvert(b.id)}
          onRetirer={setARetirer}
          onDetailEssai={setDetailEssai}
          onAjouter={() => setAjout(b)}
        />
      ))}
      {detailEssai && !readOnly && <DetailEssaiModal ligne={detailEssai} onClose={() => setDetailEssai(null)} />}
      {ajout && !readOnly && <AjouterPresentModal bloc={ajout} onClose={() => setAjout(null)} onAjoute={() => { setAjout(null); charger(); }} />}
      {aRetirer && !readOnly && (
        <ConfirmDialog
          title="Retirer cette présence ?"
          message={
            // Essai dont c'est l'unique présence (pas « déjà utilisé » = pas d'autre
            // séance) → la fiche d'essai sera supprimée et les relances cesseront.
            aRetirer.essai && !aRetirer.essaiDejaUtilise
              ? `${aRetirer.prenom} ${aRetirer.nom} ne sera plus compté(e) sur cette séance. Cette personne était en séance d'essai : sa fiche d'essai sera supprimée et elle ne recevra pas de relance.`
              : `${aRetirer.prenom} ${aRetirer.nom} ne sera plus compté(e) sur cette séance.`
          }
          confirmLabel="Retirer" variant="danger" busy={busy}
          onCancel={() => setARetirer(null)} onConfirm={retirer}
        />
      )}
    </div>
  );
}

function BlocCours({
  bloc, readOnly, filtre, open, onFiltre, onToggleOpen, onRetirer, onDetailEssai, onAjouter,
}: {
  bloc: Bloc; readOnly: boolean; filtre: Categorie | null; open: boolean;
  onFiltre: (c: Categorie | null) => void; onToggleOpen: () => void;
  onRetirer: (l: Ligne) => void; onDetailEssai: (l: Ligne) => void; onAjouter: () => void;
}) {
  const vide = bloc.nbPresents === 0;
  const lignes = filtre ? bloc.lignes.filter((l) => ligneDansCat(l, filtre)) : bloc.lignes;
  const listeOuverte = open || !!filtre;

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

      {/* Compteurs / filtres (seulement s'il y a des présents). Chevauchement assumé. */}
      {!vide && (
        <div className="mt-3 flex flex-wrap gap-1.5">
          {CAT_ORDER.filter((c) => bloc.compteurs[c] > 0).map((c) => (
            <button
              key={c}
              onClick={() => onFiltre(filtre === c ? null : c)}
              className={`rounded-full border px-2.5 py-1 text-xs font-semibold ${filtre === c ? "border-orange bg-orange-50 text-orange" : "border-line text-ink/70"}`}
            >
              {CAT_LABEL[c]} · {bloc.compteurs[c]}
            </button>
          ))}
        </div>
      )}

      {/* Flèche « Voir les présents » (repliable), seulement si des présents. */}
      {!vide && (
        <button onClick={onToggleOpen} className="mt-3 flex items-center gap-1 text-sm font-semibold text-ink/70 hover:text-ink">
          <ChevronDown className={`h-4 w-4 transition-transform ${listeOuverte ? "rotate-180" : ""}`} />
          {listeOuverte ? "Masquer les présents" : "Voir les présents"}
        </button>
      )}

      {/* Liste repliable (animation douce via grid-rows, pas de saut). */}
      {vide ? (
        <p className="mt-3 text-sm text-smoke">Aucun présent pour l&apos;instant.</p>
      ) : (
        <div className={`grid transition-all duration-300 ${listeOuverte ? "grid-rows-[1fr] opacity-100" : "grid-rows-[0fr] opacity-0"}`}>
          <div className="overflow-hidden">
            <ul className="mt-2 divide-y divide-line">
              {lignes.map((l) => (
                <LigneRow key={l.presenceId} l={l} readOnly={readOnly} onRetirer={() => onRetirer(l)} onDetailEssai={() => onDetailEssai(l)} />
              ))}
              {lignes.length === 0 && <li className="py-3 text-center text-sm text-smoke">Personne pour ce filtre.</li>}
            </ul>
          </div>
        </div>
      )}

      {!readOnly && (
        <button onClick={onAjouter} className="mt-3 rounded-full border border-line px-4 py-2 text-sm font-semibold text-ink hover:border-orange">
          + Ajouter un présent
        </button>
      )}
    </div>
  );
}

function Badge({ tone, children }: { tone: "rouge" | "bleu" | "ambre"; children: React.ReactNode }) {
  const cls = tone === "rouge" ? "bg-red-50 text-red-700" : tone === "bleu" ? "bg-blue-50 text-blue-700" : "bg-amber-50 text-amber-700";
  return <span className={`rounded-full px-1.5 py-0.5 text-[11px] font-bold ${cls}`}>{children}</span>;
}

function LigneRow({ l, readOnly, onRetirer, onDetailEssai }: { l: Ligne; readOnly: boolean; onRetirer: () => void; onDetailEssai: () => void }) {
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
        <div className="flex flex-wrap items-center gap-1.5">
          <p className="truncate font-semibold text-ink">{l.prenom} {l.nom.toUpperCase()}</p>
          {l.essai && !l.essaiDejaUtilise && <Badge tone="bleu">Essai</Badge>}
          {l.essaiDejaUtilise && <Badge tone="rouge">Essai déjà utilisé</Badge>}
          {l.horsFormule && <Badge tone="rouge">Hors formule</Badge>}
          {l.incomplet && <Badge tone="ambre">Dossier incomplet</Badge>}
        </div>
        <p className="flex items-center gap-1.5 text-xs text-smoke">
          {!l.essai && l.couleur && <span className={`h-2 w-2 rounded-full ${DOT_BG[l.couleur]}`} />}
          {l.statutLabel}
          <span className="text-smoke/60">· {l.heure}</span>
        </p>
      </div>
    </div>
  );
  return (
    <li className="flex items-center gap-2 py-2">
      <div className="min-w-0 flex-1">
        {!readOnly && l.essai ? (
          <button onClick={onDetailEssai} className="w-full text-left">{contenu}</button>
        ) : !readOnly && l.dossierId ? (
          <Link href={`/admin/adherents/${l.dossierId}`}>{contenu}</Link>
        ) : (
          contenu
        )}
      </div>
      {!readOnly && (
        <button onClick={onRetirer} aria-label="Retirer" className="shrink-0 rounded-full px-2 py-1 text-smoke hover:text-red-600">×</button>
      )}
    </li>
  );
}

// ---------------------------------------------------------------------------
// HISTORIQUE (grille Planning réutilisée)
// ---------------------------------------------------------------------------
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
      .then((r) => r.json()).then((d) => setCounts(d.counts ?? {})).catch(() => {});
  }, [semaineISO]);

  const decaler = (delta: number) => setSemaineISO((s) => toISODate(lundiDeLaSemaine(dateDuJour(s, 1 + delta))));

  return (
    <div className="rounded-[1.5rem] border border-line bg-white p-4 sm:p-6">
      <PlanningSemaine
        semaineISO={semaineISO}
        cours={cours.filter((c) => c.actif)}
        affectations={[]} profs={[]} periodes={periodes} readOnly
        onPrev={() => decaler(-7)} onNext={() => decaler(7)}
        onToday={() => setSemaineISO(toISODate(lundiDeLaSemaine(new Date())))}
        renderCarte={(c) => {
          const date = toISODate(dateDuJour(semaineISO, c.jour_semaine ?? 1));
          const n = counts[`${c.id}|${date}`] ?? 0;
          const col = couleurCours(c.discipline, c.type_adherent);
          return (
            <button onClick={() => setSeance({ coursId: c.id, date })} style={{ backgroundColor: col.bg, borderLeftColor: col.bar }}
              className="flex min-h-[4.25rem] w-full flex-col rounded-lg border border-l-4 border-line/60 px-2 py-1.5 text-left">
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
      .then((r) => r.json()).then((d) => setBloc((d.cours ?? []).find((b: Bloc) => b.id === coursId) ?? null)).catch(() => setBloc(null));
  }, [coursId, date]);
  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-ink/40 p-4" onClick={onClose}>
      <div className="max-h-[85vh] w-full max-w-md overflow-y-auto rounded-[1.5rem] bg-white p-5" onClick={(e) => e.stopPropagation()}>
        {bloc === undefined ? <p className="py-8 text-center text-sm text-smoke">…</p> : !bloc ? <p className="py-8 text-center text-sm text-smoke">Aucune donnée.</p> : (
          <>
            <h3 className="font-display text-lg font-extrabold uppercase text-ink">{bloc.libelle}</h3>
            <p className="text-sm text-smoke">{new Date(date).toLocaleDateString("fr-FR", { dateStyle: "long" })} · {bloc.horaire} · {bloc.nbPresents} présent{bloc.nbPresents > 1 ? "s" : ""}</p>
            <ul className="mt-3 divide-y divide-line">
              {bloc.lignes.map((l) => <LigneRow key={l.presenceId} l={l} readOnly onRetirer={() => {}} onDetailEssai={() => {}} />)}
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
        <div className="flex flex-wrap items-center gap-1.5">
          <Badge tone="bleu">Séance d&apos;essai</Badge>
          {ligne.essaiDejaUtilise && <Badge tone="rouge">déjà utilisée</Badge>}
        </div>
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
        {mode === "adherent" ? <AjoutAdherent bloc={bloc} onAjoute={onAjoute} /> : <AjoutEssai bloc={bloc} onAjoute={onAjoute} />}
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
        method: "POST", headers: { "Content-Type": "application/json", ...adminAuthHeaders() },
        body: JSON.stringify({ coursId: bloc.id, date: bloc.dateISO, dossierId }),
      });
      onAjoute();
    } finally { setBusy(false); }
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
    setBusy(true); setErreur("");
    try {
      const r = await fetch("/api/admin/presence/essai", {
        method: "POST", headers: { "Content-Type": "application/json", ...adminAuthHeaders() },
        body: JSON.stringify({ coursId: bloc.id, date: bloc.dateISO, prenom, nom, date_naissance: dob, email }),
      });
      const d = await r.json();
      if (!r.ok) { setErreur(d.error || "Enregistrement impossible."); return; }
      onAjoute();
    } finally { setBusy(false); }
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
  const [err, setErr] = useState("");
  useEffect(() => {
    fetch("/api/admin/planning/cours", { headers: adminAuthHeaders(), cache: "no-store" })
      .then((r) => r.json())
      .then((d) => { const set = new Set<string>(); for (const c of d.cours ?? []) if (c.salle) set.add(c.salle as string); setSalles([...set].sort()); })
      .catch(() => {});
  }, []);
  async function ouvrir(slug: string) {
    setErr("");
    const r = await fetch(`/api/admin/presence/affiche${slug ? `?salle=${encodeURIComponent(slug)}` : ""}`, { headers: adminAuthHeaders() });
    if (!r.ok) { setErr((await r.text().catch(() => "")) || "Génération impossible."); return; }
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
            <button key={s} onClick={() => ouvrir(slugSalle(s))} className="w-full rounded-xl border border-line px-4 py-2.5 text-left text-sm font-semibold text-ink hover:border-orange">{s}</button>
          ))}
          <button onClick={() => ouvrir("")} className="w-full rounded-xl border border-dashed border-line px-4 py-2.5 text-left text-sm font-semibold text-ink hover:border-orange">Affiche générique (sans salle)</button>
        </div>
        {err && <p className="mt-3 rounded-xl bg-red-50 p-3 text-sm font-semibold text-red-700">{err}</p>}
        <button onClick={onClose} className="mt-4 w-full rounded-full border border-line px-5 py-2.5 text-sm font-semibold text-ink">Fermer</button>
      </div>
    </div>
  );
}

function Squelette() {
  return <div className="space-y-4">{[0, 1].map((i) => <div key={i} className="h-40 animate-pulse rounded-[1.5rem] border border-line bg-white" />)}</div>;
}

// Erreur de chargement affichée COMME une erreur (jamais un état vide trompeur).
// `inline` : bandeau discret en tête quand des données (cache) restent affichées.
function ErreurPresence({ message, onRetry, inline = false }: { message: string; onRetry: () => void; inline?: boolean }) {
  return (
    <div className={`rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-700 ${inline ? "" : "text-center"}`}>
      <p className="font-semibold">Impossible de charger les présences.</p>
      <p className="mt-1 text-red-600/90">{message}</p>
      <button onClick={onRetry} className="mt-3 rounded-full border border-red-300 bg-white px-4 py-1.5 text-xs font-bold text-red-700 hover:bg-red-100">
        Réessayer
      </button>
    </div>
  );
}
