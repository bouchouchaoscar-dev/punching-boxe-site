"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip as RTooltip, XAxis, YAxis } from "recharts";
import { useDonneesAdmin } from "./useDonneesAdmin";
import { CLES } from "@/lib/admin-cache";
import { FiltresBar } from "./FiltresBar";
import { SelectMenu } from "@/components/ui/SelectMenu";
import { Tooltip } from "@/components/ui/Tooltip";
import { DatePicker } from "@/components/ui/DatePicker";
import { DetailEssaiModal, type Ligne } from "./Presence";
import { disciplineLabel } from "@/lib/planning";
import { CONFIG_CLUB } from "@/lib/config-club";
import type { PersonneEssai, LigneStat, SuiviEssais } from "@/lib/essais-stats";

type Reponse = Omit<SuiviEssais, "personnes"> & { periode: { from: string; to: string; saison: string }; personnes: PersonneEssai[] };

const STATUT: Record<string, { label: string; cls: string }> = {
  inscrit: { label: "Inscrit", cls: "bg-green-50 text-green-700" },
  dossier_en_cours: { label: "Dossier en cours", cls: "bg-blue-50 text-blue-700" },
  en_attente: { label: "En attente", cls: "bg-paper-2 text-smoke" },
  a_rappeler: { label: "À rappeler", cls: "bg-orange-50 text-orange" },
  rappele: { label: "Rappelé", cls: "bg-violet-50 text-violet-700" },
};
const SEUIL = CONFIG_CLUB.modules.presence.conversionSeuilJours ?? 14;
const pct = (t: number | null) => (t == null ? "—" : `${Math.round(t * 100)} %`);
const frDate = (iso: string) => { const [y, m, d] = iso.split("-"); return `${d}/${m}/${y}`; };
function saisonDe(now: Date): string { const m = now.getMonth(), y = now.getFullYear(); if (m >= 8) return `${y}-${y + 1}`; if (m <= 4) return `${y - 1}-${y}`; return `${y}-${y + 1}`; }
const MOIS = ["janv.", "févr.", "mars", "avr.", "mai", "juin", "juil.", "août", "sept.", "oct.", "nov.", "déc."];
const moisLabel = (ym: string) => { const [y, m] = ym.split("-").map(Number); return `${MOIS[m - 1]} ${String(y).slice(2)}`; };

export function VueEssais() {
  // --- Période : saison (défaut) / mois précis / personnalisée ---
  const saison = saisonDe(new Date());
  const [an1] = saison.split("-").map(Number);
  const mois = useMemo(() => Array.from({ length: 12 }, (_, i) => { const idx = (8 + i) % 12; const an = i < 4 ? an1 : an1 + 1; const m = idx + 1; return { value: `${an}-${String(m).padStart(2, "0")}`, label: `${MOIS[idx]} ${an}` }; }), [an1]);
  const [mode, setMode] = useState<"saison" | "mois" | "perso">("saison");
  const [moisSel, setMoisSel] = useState(mois[0].value);
  const [persoFrom, setPersoFrom] = useState("");
  const [persoTo, setPersoTo] = useState("");

  const { from, to, periodeKey } = useMemo(() => {
    if (mode === "mois") { const [y, m] = moisSel.split("-").map(Number); const fin = new Date(Date.UTC(y, m, 0)).getUTCDate(); return { from: `${moisSel}-01`, to: `${moisSel}-${String(fin).padStart(2, "0")}`, periodeKey: `mois.${moisSel}` }; }
    if (mode === "perso" && persoFrom && persoTo) return { from: persoFrom, to: persoTo, periodeKey: `perso.${persoFrom}.${persoTo}` };
    return { from: "", to: "", periodeKey: `saison.${saison}` };
  }, [mode, moisSel, persoFrom, persoTo, saison]);

  const url = `/api/admin/presence/essais${from && to ? `?from=${from}&to=${to}` : ""}`;
  const { data, error, refreshing, refresh } = useDonneesAdmin<Reponse | null>(CLES.presenceEssais(periodeKey), url, (d) => d as Reponse);

  // --- Filtres ---
  const [q, setQ] = useState("");
  const [fStatut, setFStatut] = useState("");
  const [fDisc, setFDisc] = useState("");
  const [fCours, setFCours] = useState("");
  const [fProf, setFProf] = useState("");
  const [fProv, setFProv] = useState("");
  const [fPublic, setFPublic] = useState("");
  const [detail, setDetail] = useState<PersonneEssai | null>(null);

  const personnes = data?.personnes ?? [];
  const optsCours = useMemo(() => uniq(personnes.map((p) => [p.coursId ?? "", p.coursLabel])), [personnes]);
  const optsProf = useMemo(() => uniq(personnes.flatMap((p) => (p.profs.length ? p.profs.map((x) => [x.id, x.nom] as [string, string]) : [["__aucun__", "Prof non renseigné"]] as [string, string][]))), [personnes]);
  const optsProv = useMemo(() => uniq(personnes.map((p) => [p.provenance ?? "__none__", p.provenance ? p.provenanceLabel : "Non renseigné"])), [personnes]);
  const optsDisc = useMemo(() => uniq(personnes.map((p) => [p.discipline ?? "", p.discipline ? disciplineLabel(p.discipline) : "—"])), [personnes]);

  const liste = useMemo(() => personnes.filter((p) => {
    if (q.trim() && !`${p.prenom} ${p.nom}`.toLowerCase().includes(q.trim().toLowerCase())) return false;
    if (fStatut && p.statut !== fStatut) return false;
    if (fDisc && (p.discipline ?? "") !== fDisc) return false;
    if (fCours && (p.coursId ?? "") !== fCours) return false;
    if (fProf && !(p.profs.length ? p.profs.some((x) => x.id === fProf) : fProf === "__aucun__")) return false;
    if (fProv && (p.provenance ?? "__none__") !== fProv) return false;
    if (fPublic && (fPublic === "jeune" ? !p.mineur : p.mineur)) return false;
    return true;
  }), [personnes, q, fStatut, fDisc, fCours, fProf, fProv, fPublic]);

  const nbFiltres = [fStatut, fDisc, fCours, fProf, fProv, fPublic].filter(Boolean).length;
  const reset = () => { setQ(""); setFStatut(""); setFDisc(""); setFCours(""); setFProf(""); setFProv(""); setFPublic(""); };

  if (error && !data) return <div className="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">Impossible de charger les essais. <button onClick={refresh} className="ml-2 underline">Réessayer</button></div>;
  if (!data) return <Squelette />;
  const k = data.kpis;

  return (
    <div className="space-y-6">
      {/* Période */}
      <div className="flex flex-wrap items-center gap-2">
        <SelectMenu value={mode} onChange={(v) => setMode(v as typeof mode)} options={[{ value: "saison", label: `Saison ${saison}` }, { value: "mois", label: "Par mois" }, { value: "perso", label: "Période personnalisée" }]} />
        {mode === "mois" && <SelectMenu value={moisSel} onChange={setMoisSel} options={mois} variant="neutre" />}
        {mode === "perso" && (<><div className="w-40"><DatePicker value={persoFrom} onChange={setPersoFrom} placeholder="Du" /></div><div className="w-40"><DatePicker value={persoTo} onChange={setPersoTo} placeholder="Au" /></div></>)}
        {refreshing && <span className="text-xs text-smoke">…</span>}
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        <Kpi label="Essais" value={String(k.essais)} sub={`${k.seances} séance${k.seances > 1 ? "s" : ""}`} />
        <Kpi label="Inscrits" value={String(k.inscrits)} accent />
        <Tooltip content={<span>{k.inscritsMurs} inscrits sur {k.murs} essais de plus de {SEUIL} jours</span>}>
          <Kpi label="Taux de conversion" value={pct(k.taux)} sub={`${k.inscritsMurs}/${k.murs} mûrs`} />
        </Tooltip>
        <Kpi label="Délai médian" value={k.delaiMedian == null ? "—" : `${k.delaiMedian} j`} />
        <button onClick={() => { setFStatut(fStatut === "a_rappeler" ? "" : "a_rappeler"); }} className="text-left">
          <Kpi label="À rappeler" value={String(k.aRappeler)} warn={fStatut === "a_rappeler"} />
        </button>
      </div>
      {k.enCours > 0 && <p className="text-xs text-smoke">{k.enCours} essai{k.enCours > 1 ? "s" : ""} en cours (moins de {SEUIL} jours), exclu{k.enCours > 1 ? "s" : ""} du taux.</p>}

      {/* Filtres */}
      <FiltresBar q={q} onQ={setQ} placeholder="Rechercher un nom…" activeCount={nbFiltres} onReset={reset}>
        <SelectMenu value={fStatut} onChange={setFStatut} variant="neutre" options={[{ value: "", label: "Tous statuts" }, ...Object.entries(STATUT).map(([v, s]) => ({ value: v, label: s.label }))]} />
        <SelectMenu value={fDisc} onChange={setFDisc} variant="neutre" options={[{ value: "", label: "Disciplines" }, ...optsDisc]} />
        <SelectMenu value={fCours} onChange={setFCours} variant="neutre" options={[{ value: "", label: "Cours" }, ...optsCours]} />
        <SelectMenu value={fProf} onChange={setFProf} variant="neutre" options={[{ value: "", label: "Profs" }, ...optsProf]} />
        <SelectMenu value={fProv} onChange={setFProv} variant="neutre" options={[{ value: "", label: "Provenances" }, ...optsProv]} />
        <SelectMenu value={fPublic} onChange={setFPublic} variant="neutre" options={[{ value: "", label: "Tous" }, { value: "jeune", label: "Jeune" }, { value: "adulte", label: "Adulte" }]} />
      </FiltresBar>

      {/* Liste */}
      {liste.length === 0 ? (
        <div className="rounded-2xl border border-line bg-white p-8 text-center text-sm text-smoke">{personnes.length === 0 ? "Aucun essai sur cette période." : "Aucun essai ne correspond aux filtres."}</div>
      ) : (
        <ul className="space-y-2">
          {liste.map((p) => <CarteEssai key={p.essaiId} p={p} onOpen={() => setDetail(p)} />)}
        </ul>
      )}

      {/* Statistiques */}
      <StatsBlocs data={data} />

      {detail && (
        <DetailEssaiModal
          ligne={{ essaiId: detail.essaiId, prenom: detail.prenom, nom: detail.nom, email: detail.email, converti: !!detail.dossierId } as Ligne}
          onClose={() => setDetail(null)}
          onChange={() => { setDetail(null); refresh(); }}
        />
      )}
    </div>
  );
}

function CarteEssai({ p, onOpen }: { p: PersonneEssai; onOpen: () => void }) {
  const s = STATUT[p.statut];
  const aRappeler = p.statut === "a_rappeler";
  return (
    <li className="rounded-2xl border border-line bg-white p-3">
      <div className="flex items-start justify-between gap-3">
        <button onClick={onOpen} className="min-w-0 flex-1 text-left">
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="font-semibold text-ink">{p.prenom} {p.nom.toUpperCase()}</span>
            <span className="rounded-full bg-paper-2 px-2 py-0.5 text-[0.65rem] font-bold uppercase text-smoke">{p.mineur ? "Jeune" : "Adulte"}</span>
            {p.nbSeances > 1 && <span className="rounded-full bg-blue-50 px-2 py-0.5 text-[0.65rem] font-bold text-blue-700">{p.nbSeances} essais</span>}
            <span className={`rounded-full px-2 py-0.5 text-[0.65rem] font-bold ${s.cls}`}>{s.label}</span>
            {p.inscrit && p.delaiJours != null && <span className="text-xs text-green-700">Inscrit en {p.delaiJours} j</span>}
          </div>
          <p className="mt-0.5 text-xs text-smoke">
            {frDate(p.premiereSeance)} · {p.coursLabel}{p.profs.length ? ` · ${p.profs.map((x) => x.nom).join(", ")}` : " · Prof non renseigné"}
            {p.provenance ? ` · ${p.provenanceLabel}` : ""}
          </p>
        </button>
        <div className="flex shrink-0 flex-col items-end gap-1">
          {(p.dossierId) && <Link href={`/admin/adherents/${p.dossierId}`} className="text-xs font-bold text-orange hover:underline">Fiche →</Link>}
          {aRappeler && (p.telephone ? <a href={`tel:${p.telephone}`} className="rounded-full bg-orange px-3 py-1.5 text-xs font-bold text-white">Appeler</a> : <span className="text-[0.65rem] text-smoke">Tél. non renseigné</span>)}
        </div>
      </div>
    </li>
  );
}

function StatsBlocs({ data }: { data: Reponse }) {
  const maxMois = Math.max(1, ...data.parMois.map((m) => m.essais));
  return (
    <div className="space-y-6">
      {/* a. Par mois */}
      <Carte titre="Essais et inscrits par mois">
        {data.parMois.length === 0 ? <Vide /> : (
          <ResponsiveContainer width="100%" height={240}>
            <BarChart data={data.parMois.map((m) => ({ mois: moisLabel(m.mois), Essais: m.essais, Inscrits: m.inscrits }))}>
              <CartesianGrid strokeDasharray="3 3" stroke="#eee" />
              <XAxis dataKey="mois" tick={{ fontSize: 12 }} stroke="#bbb" />
              <YAxis allowDecimals={false} tick={{ fontSize: 12 }} stroke="#bbb" width={30} domain={[0, Math.ceil(maxMois * 1.2)]} />
              <RTooltip />
              <Legend />
              <Bar dataKey="Essais" fill="#94a3b8" radius={[4, 4, 0, 0]} />
              <Bar dataKey="Inscrits" fill="#16a34a" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        )}
        {data.parMois.some((m) => m.enCours) && <p className="mt-1 text-xs text-smoke">Les mois récents contiennent des essais encore en cours (moins de {SEUIL} jours).</p>}
      </Carte>

      {/* b. Par prof */}
      <Carte titre="Conversion par prof"><TableStats lignes={data.parProf} colEssais="Essais" /></Carte>
      {/* c. Par cours */}
      <Carte titre="Conversion par cours"><TableStats lignes={data.parCours} colEssais="Essais" /></Carte>
      {/* d. Par provenance */}
      <Carte titre="D'où viennent les essais"><TableStats lignes={data.parProvenance} colEssais="Essais" /></Carte>

      {/* Provenance des nouveaux adhérents SANS essai */}
      {data.provenanceNouveaux.length > 0 && (
        <Carte titre="Nouveaux adhérents sans essai (provenance)">
          <ul className="divide-y divide-line text-sm">
            {data.provenanceNouveaux.map((p) => (
              <li key={p.code} className="flex justify-between py-1.5"><span className="text-ink">{p.label}</span><span className="font-semibold text-ink">{p.nombre}</span></li>
            ))}
          </ul>
        </Carte>
      )}
    </div>
  );
}

function TableStats({ lignes }: { lignes: LigneStat[]; colEssais: string }) {
  if (lignes.length === 0) return <Vide />;
  return (
    <>
      {/* Desktop : tableau */}
      <div className="hidden overflow-x-auto sm:block">
        <table className="w-full text-sm">
          <thead><tr className="border-b border-line text-left text-xs uppercase text-smoke"><th className="py-2">&nbsp;</th><th className="py-2 text-center">Essais</th><th className="py-2 text-center">Inscrits</th><th className="py-2 text-center">Taux</th><th className="py-2 text-center">Délai médian</th></tr></thead>
          <tbody>
            {lignes.map((l) => (
              <tr key={l.cle} className="border-b border-line/60">
                <td className="py-2 pr-2 font-semibold text-ink">{l.label}</td>
                <td className="py-2 text-center text-ink">{l.essais}</td>
                <td className="py-2 text-center text-ink">{l.inscrits}<span className="text-smoke">/{l.murs}</span></td>
                <td className="py-2 text-center"><Taux l={l} /></td>
                <td className="py-2 text-center text-ink">{l.delaiMedian == null ? "—" : `${l.delaiMedian} j`}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {/* Mobile : cartes empilées */}
      <ul className="space-y-2 sm:hidden">
        {lignes.map((l) => (
          <li key={l.cle} className="rounded-xl border border-line p-3">
            <div className="flex items-center justify-between"><span className="font-semibold text-ink">{l.label}</span><Taux l={l} /></div>
            <p className="mt-1 text-xs text-smoke">{l.inscrits}/{l.murs} inscrits (mûrs) · {l.essais} essais · délai {l.delaiMedian == null ? "—" : `${l.delaiMedian} j`}</p>
          </li>
        ))}
      </ul>
    </>
  );
}

function Taux({ l }: { l: LigneStat }) {
  if (l.taux == null) return <span className="text-smoke">—</span>;
  if (l.echantillonFaible) return <Tooltip content="Échantillon trop petit (moins de 5 essais mûrs)"><span className="text-smoke">{pct(l.taux)} *</span></Tooltip>;
  return <span className="font-semibold text-ink">{pct(l.taux)}</span>;
}

function Kpi({ label, value, sub, accent, warn }: { label: string; value: string; sub?: string; accent?: boolean; warn?: boolean }) {
  return (
    <div className={`rounded-2xl border p-4 ${accent ? "border-transparent bg-ink text-white" : warn ? "border-orange bg-orange-50" : "border-line bg-white"}`}>
      <p className={`text-[0.65rem] font-bold uppercase tracking-wide ${accent ? "text-white/50" : "text-smoke"}`}>{label}</p>
      <p className={`font-display mt-1 text-2xl font-black ${accent ? "text-white" : warn ? "text-orange" : "text-ink"}`}>{value}</p>
      {sub && <p className={`text-[0.65rem] ${accent ? "text-white/50" : "text-smoke"}`}>{sub}</p>}
    </div>
  );
}

function Carte({ titre, children }: { titre: string; children: React.ReactNode }) {
  return <div className="rounded-2xl border border-line bg-white p-4 sm:p-5"><h3 className="mb-3 font-display text-base font-extrabold uppercase text-ink">{titre}</h3>{children}</div>;
}
const Vide = () => <p className="py-4 text-center text-sm text-smoke">Aucune donnée sur cette période.</p>;
function Squelette() { return <div className="space-y-4">{[0, 1, 2].map((i) => <div key={i} className="h-28 animate-pulse rounded-2xl border border-line bg-white" />)}</div>; }

// Options uniques [value,label] triées par label, value non vide.
function uniq(pairs: [string, string][]): { value: string; label: string }[] {
  const m = new Map<string, string>();
  for (const [v, l] of pairs) if (v) m.set(v, l);
  return [...m.entries()].map(([value, label]) => ({ value, label })).sort((a, b) => a.label.localeCompare(b.label, "fr"));
}
