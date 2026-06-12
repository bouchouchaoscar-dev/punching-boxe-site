"use client";

import { useEffect, useMemo, useState } from "react";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { useSaisonAdmin, ALL_SAISONS } from "./SaisonContext";
import { adminAuthHeaders } from "@/lib/admin-auth";
import { analyserSaisons } from "@/lib/stats-insights";
import { euro } from "@/lib/pricing";
import { estActifCompte } from "@/lib/adherents-actifs";

const ORANGE = "#FF6B00";
const INK = "#0A0A0A";

type Disc = { BF: number; SAVATE: number; LES_2: number; AUTRE: number };
type Ages = { jeunes: number; adultes: number; inconnu: number };
type SerieEntry = {
  saison: string;
  source: "historique" | "natif";
  ca: number;
  effectifs: number;
  disciplines: Disc;
  ages: Ages;
  enCours: boolean;
};

export function Dashboard() {
  const { adherents, loading, error, selectedSaison } = useSaisonAdmin();
  const [serie, setSerie] = useState<SerieEntry[]>([]);
  // Lignes encaissées NET (Σ montant − remboursé) avec leur date de paiement.
  // Source unique = table paiements. Sert au KPI « Encaissé » + aux graphes
  // mensuels (encaissé regroupé par mois de PAIEMENT, pas par mois d'inscription).
  const [payRows, setPayRows] = useState<
    { adherent_id: string; net: number; date: string }[]
  >([]);

  useEffect(() => {
    fetch("/api/admin/stats-saisons", { headers: adminAuthHeaders(), cache: "no-store" })
      .then((r) => r.json())
      .then((d) => setSerie(d.serie ?? []))
      .catch(() => {});
    fetch("/api/paiements", { cache: "no-store" })
      .then((r) => r.json())
      .then((d) => {
        const rows: { adherent_id: string; net: number; date: string }[] = [];
        for (const p of d.paiements ?? []) {
          if (p.statut !== "paye" && p.statut !== "rembourse") continue;
          rows.push({
            adherent_id: p.adherent_id,
            net: Number(p.montant || 0) - Number(p.montant_rembourse || 0),
            date: p.date_paiement ?? p.created_at,
          });
        }
        setPayRows(rows);
      })
      .catch(() => {});
  }, []);

  // Vue NATIVE (saison en cours) : calculée depuis les dossiers natifs du contexte.
  const data = useMemo(() => {
    const now = new Date();
    // Ensemble des dossiers de la saison sélectionnée (scope des paiements).
    const adhIds = new Set(adherents.map((a) => a.id));
    const moisKey = (iso: string) => {
      const d = new Date(iso);
      return `${d.getFullYear()}-${d.getMonth()}`;
    };
    // Lignes encaissées rattachées à la saison sélectionnée.
    const payRowsSaison = payRows.filter((p) => adhIds.has(p.adherent_id));
    // Encaissé = NET réel depuis paiements (carte + espèces, déduction des
    // remboursements ; un dossier fermé garde l'argent déjà encaissé). On NE
    // touche PAS à cet indicateur.
    const encaisse = payRowsSaison.reduce((s, p) => s + p.net, 0);

    // Tous les COMPTAGES de membres se font sur les ADHÉRENTS ACTIFS (définition
    // centrale : non fermés + engagés/payés ou espèces en attente).
    const actifs = adherents.filter(estActifCompte);

    const nouveauxMois = actifs.filter((a) => {
      const d = new Date(a.created_at);
      return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
    }).length;
    // Espèces RÉELLEMENT en attente (mode espèces, pas confirmées, non fermées).
    const attenteEspeces = adherents.filter(
      (a) =>
        !a.annule_at &&
        a.mode_paiement === "especes" &&
        a.statut_paiement === "en_attente",
    ).length;
    // Échecs à régulariser : non fermés (inclut un 1er paiement échoué).
    const echecs = adherents.filter(
      (a) => !a.annule_at && a.statut_paiement === "echec_paiement",
    ).length;
    const formuleBoxe = actifs.filter(
      (a) => a.package === "boxe_classique" && !a.option_prepa_physique,
    ).length;
    const boxePrepa = actifs.filter(
      (a) => a.package === "boxe_classique" && a.option_prepa_physique,
    ).length;
    const savateForme = actifs.filter((a) => a.package === "savate_prepa").length;

    // Fenêtre de 12 mois alignée sur la VRAIE étendue d'une saison (juin → mai,
    // cf. lib/saison) : les inscriptions anticipées de juin doivent compter.
    const SEASON_LABELS = ["Juin","Juil","Août","Sept","Oct","Nov","Déc","Janv","Févr","Mars","Avril","Mai"];
    const seasonStartYear =
      selectedSaison !== ALL_SAISONS && /^\d{4}-\d{4}$/.test(selectedSaison)
        ? parseInt(selectedSaison.slice(0, 4), 10)
        : now.getMonth() >= 5
          ? now.getFullYear()
          : now.getFullYear() - 1;
    const months = SEASON_LABELS.map((label, idx) => {
      const monthIndex = (5 + idx) % 12; // 5 = juin
      // juin→déc → année de début ; janv→mai → année suivante.
      const year = monthIndex >= 5 ? seasonStartYear : seasonStartYear + 1;
      return { key: `${year}-${monthIndex}`, label };
    });
    const byMonth = months.map((m) => {
      // Inscriptions = dossiers ACTIFS créés ce mois-là (les fermés sont exclus).
      const inscriptions = actifs.filter(
        (a) => moisKey(a.created_at) === m.key,
      ).length;
      // Montant = encaissé NET regroupé par mois de PAIEMENT.
      const montant = payRowsSaison
        .filter((p) => moisKey(p.date) === m.key)
        .reduce((s, p) => s + p.net, 0);
      return { mois: m.label, inscriptions, montant };
    });

    const adultes = actifs.filter((a) => a.type_adherent === "adulte").length;
    const jeunes = actifs.filter((a) => a.type_adherent === "jeune").length;
    const enLigne = actifs.filter((a) => (a.mode_paiement ?? "").startsWith("stripe")).length;
    const especes = actifs.filter((a) => a.mode_paiement === "especes").length;

    return {
      total: actifs.length,
      encaisse,
      nouveauxMois,
      attenteEspeces,
      echecs,
      formuleBoxe,
      boxePrepa,
      savateForme,
      byMonth,
      typeData: [
        { name: "Adultes", value: adultes, color: ORANGE },
        { name: "Jeunes", value: jeunes, color: INK },
      ].filter((x) => x.value > 0),
      repartitionMode: [
        { name: "Paiement en ligne", value: enLigne, color: ORANGE },
        { name: "Espèces", value: especes, color: INK },
      ].filter((x) => x.value > 0),
      repartitionFormule: [
        { name: "Boxe Française", value: actifs.filter((a) => a.package === "boxe_classique").length, color: ORANGE },
        { name: "Savate et Prépa", value: savateForme, color: INK },
      ].filter((x) => x.value > 0),
    };
  }, [adherents, selectedSaison, payRows]);

  if (loading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <span className="h-8 w-8 animate-spin rounded-full border-2 border-ink/20 border-t-orange" />
      </div>
    );
  }

  const enAll = selectedSaison === ALL_SAISONS;
  const entry = serie.find((s) => s.saison === selectedSaison);
  const estPasse = !enAll && entry?.source === "historique";

  return (
    <div>
      <div className="flex items-end justify-between">
        <div>
          <h1 className="font-display text-4xl font-black uppercase text-ink">Tableau de bord</h1>
          <p className="mt-1 text-smoke">
            {enAll ? "Toutes les saisons" : `Saison ${selectedSaison}`}
            {entry?.enCours ? " (en cours)" : ""}
          </p>
          <p className="mt-2 max-w-2xl text-sm text-smoke">
            Les statistiques du club en temps réel : nombre d&apos;adhérents,
            formules choisies, chiffre d&apos;affaires et évolution par saison.
          </p>
        </div>
      </div>

      {error && (
        <div className="mt-6 rounded-xl bg-amber-50 p-4 text-sm text-amber-800">
          {error} — vérifiez la configuration Supabase.
        </div>
      )}

      {enAll ? (
        <ToutesSaisons serie={serie} />
      ) : estPasse && entry ? (
        <SaisonPassee entry={entry} />
      ) : (
        <SaisonNative data={data} />
      )}
    </div>
  );
}

type Repart = { name: string; value: number; color: string }[];
type NatifData = {
  total: number;
  encaisse: number;
  nouveauxMois: number;
  attenteEspeces: number;
  echecs: number;
  formuleBoxe: number;
  boxePrepa: number;
  savateForme: number;
  byMonth: { mois: string; inscriptions: number; montant: number }[];
  typeData: Repart;
  repartitionMode: Repart;
  repartitionFormule: Repart;
};

// ---- Vue saison NATIVE (en cours) ----
function SaisonNative({ data }: { data: NatifData }) {
  return (
    <>
      <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Kpi label="Adhérents" value={String(data.total)} accent />
        <Kpi label="Encaissé" value={euro(data.encaisse)} />
        <Kpi label="Nouveaux ce mois" value={String(data.nouveauxMois)} />
        <Kpi label="En attente espèces" value={String(data.attenteEspeces)} warn />
        <Kpi label="⚠️ Échecs paiement" value={String(data.echecs)} danger />
        <Kpi label="Formule Boxe" value={String(data.formuleBoxe)} />
        <Kpi label="Boxe + Prépa" value={String(data.boxePrepa)} />
        <Kpi label="Savate et Prépa" value={String(data.savateForme)} />
      </div>

      {data.total === 0 ? (
        <div className="mt-10 rounded-[1.5rem] border border-dashed border-line bg-white p-12 text-center">
          <p className="font-display text-2xl font-extrabold uppercase text-ink">Aucun adhérent</p>
          <p className="mx-auto mt-2 max-w-md text-sm text-smoke">
            Les inscriptions de cette saison apparaîtront ici dès la première soumission.
          </p>
        </div>
      ) : (
        <div className="mt-8 grid gap-5 lg:grid-cols-2">
          <ChartCard title="Inscriptions par mois">
            <ResponsiveContainer width="100%" height={240}>
              <AreaChart data={data.byMonth}>
                <defs>
                  <linearGradient id="o" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor={ORANGE} stopOpacity={0.35} />
                    <stop offset="100%" stopColor={ORANGE} stopOpacity={0} />
                  </linearGradient>
                </defs>
                <XAxis dataKey="mois" tick={{ fontSize: 12 }} stroke="#bbb" />
                <YAxis allowDecimals={false} tick={{ fontSize: 12 }} stroke="#bbb" width={28} />
                <Tooltip />
                <Area type="monotone" dataKey="inscriptions" stroke={ORANGE} strokeWidth={2.5} fill="url(#o)" />
              </AreaChart>
            </ResponsiveContainer>
          </ChartCard>

          <ChartCard title="Montants encaissés par mois">
            <ResponsiveContainer width="100%" height={240}>
              <BarChart data={data.byMonth}>
                <XAxis dataKey="mois" tick={{ fontSize: 12 }} stroke="#bbb" />
                <YAxis tick={{ fontSize: 12 }} stroke="#bbb" width={42} />
                <Tooltip formatter={(v) => euro(Number(v))} />
                <Bar dataKey="montant" fill={INK} radius={[6, 6, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </ChartCard>

          <ChartCard title="Adultes / Jeunes">
            <Donut data={data.typeData} inner={55} />
            <ChartLegend items={data.typeData} />
          </ChartCard>

          <ChartCard title="Répartition des formules">
            <Donut data={data.repartitionFormule} inner={55} />
            <ChartLegend items={data.repartitionFormule} />
          </ChartCard>
        </div>
      )}
    </>
  );
}

// ---- Vue saison PASSÉE (historique importé : CA + effectifs + disciplines) ----
function SaisonPassee({ entry }: { entry: SerieEntry }) {
  const disc = [
    { name: "Boxe Française", value: entry.disciplines.BF, color: ORANGE },
    { name: "Savate", value: entry.disciplines.SAVATE, color: INK },
    { name: "Les deux", value: entry.disciplines.LES_2, color: "#9ca3af" },
    { name: "À vérifier", value: entry.disciplines.AUTRE, color: "#e5e7eb" },
  ].filter((x) => x.value > 0);
  const ages = [
    { name: "Adultes", value: entry.ages.adultes, color: ORANGE },
    { name: "Jeunes", value: entry.ages.jeunes, color: INK },
    { name: "Inconnu", value: entry.ages.inconnu, color: "#e5e7eb" },
  ].filter((x) => x.value > 0);
  return (
    <>
      <div className="mt-6 rounded-xl border border-line bg-paper-2 p-3 text-xs text-smoke">
        Données historiques importées : CA, effectifs, disciplines et répartition
        adultes/jeunes (âge à la saison). Le détail mensuel n&apos;est pas disponible ;
        le statut adultes/jeunes est indicatif (quelques naissances manquantes ou à vérifier).
      </div>
      <div className="mt-6 grid gap-4 sm:grid-cols-3">
        <Kpi label="Chiffre d'affaires" value={euro(entry.ca)} accent />
        <Kpi label="Effectifs" value={String(entry.effectifs)} />
        <Kpi
          label="CA moyen / adhérent"
          value={entry.effectifs > 0 ? euro(Math.round(entry.ca / entry.effectifs)) : "—"}
        />
      </div>
      <div className="mt-8 grid gap-5 lg:grid-cols-2">
        {disc.length > 0 && (
          <ChartCard title="Répartition des disciplines">
            <Donut data={disc} inner={55} />
            <ChartLegend items={disc} />
          </ChartCard>
        )}
        {ages.length > 0 && (
          <ChartCard title="Adultes / Jeunes (âge à la saison)">
            <Donut data={ages} inner={55} />
            <ChartLegend items={ages} />
          </ChartCard>
        )}
      </div>
    </>
  );
}

// ---- Vue TOUTES SAISONS (évolution CA + effectifs + analyse par règles) ----
function ToutesSaisons({ serie }: { serie: SerieEntry[] }) {
  const completes = serie.filter((s) => !s.enCours);
  const caTotal = completes.reduce((s, x) => s + x.ca, 0);
  const insights = analyserSaisons(
    serie.map((s) => ({ saison: s.saison, ca: s.ca, effectifs: s.effectifs, enCours: s.enCours })),
  );
  const chartData = serie.map((s) => ({
    saison: s.saison.replace("-", "\n"),
    ca: s.ca,
    effectifs: s.effectifs,
    enCours: s.enCours,
  }));

  return (
    <>
      <div className="mt-6 grid gap-4 sm:grid-cols-3">
        <Kpi label="CA cumulé (saisons complètes)" value={euro(caTotal)} accent />
        <Kpi label="Saisons" value={String(serie.length)} />
        <Kpi
          label="Effectifs dernière saison complète"
          value={String(completes.length ? completes[completes.length - 1].effectifs : 0)}
        />
      </div>

      <div className="mt-8 grid gap-5 lg:grid-cols-2">
        <ChartCard title="Évolution du chiffre d'affaires">
          <ResponsiveContainer width="100%" height={260}>
            <BarChart data={chartData}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#eee" />
              <XAxis dataKey="saison" tick={{ fontSize: 11 }} stroke="#bbb" interval={0} />
              <YAxis tick={{ fontSize: 12 }} stroke="#bbb" width={50} />
              <Tooltip formatter={(v) => euro(Number(v))} />
              <Bar dataKey="ca" radius={[6, 6, 0, 0]}>
                {chartData.map((d, i) => (
                  <Cell key={i} fill={d.enCours ? "#f9b27a" : ORANGE} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
          <p className="mt-2 text-xs text-smoke">La saison en cours (teinte claire) est incomplète.</p>
        </ChartCard>

        <ChartCard title="Évolution des effectifs">
          <ResponsiveContainer width="100%" height={260}>
            <LineChart data={chartData}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#eee" />
              <XAxis dataKey="saison" tick={{ fontSize: 11 }} stroke="#bbb" interval={0} />
              <YAxis allowDecimals={false} tick={{ fontSize: 12 }} stroke="#bbb" width={32} />
              <Tooltip />
              <Line type="monotone" dataKey="effectifs" stroke={INK} strokeWidth={2.5} dot={{ r: 3 }} />
            </LineChart>
          </ResponsiveContainer>
        </ChartCard>
      </div>

      {insights.length > 0 && (
        <div className="mt-6 rounded-[1.5rem] border border-line bg-white p-5 sm:p-6">
          <h3 className="mb-3 font-display text-lg font-extrabold uppercase text-ink">Analyse</h3>
          <ul className="space-y-2">
            {insights.map((t, i) => (
              <li key={i} className="flex items-start gap-2 text-sm text-ink">
                <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-orange" />
                {t}
              </li>
            ))}
          </ul>
        </div>
      )}
    </>
  );
}

function Donut({ data, inner }: { data: { name: string; value: number; color: string }[]; inner: number }) {
  return (
    <ResponsiveContainer width="100%" height={220}>
      <PieChart>
        <Pie data={data} dataKey="value" nameKey="name" innerRadius={inner} outerRadius={85} paddingAngle={3}>
          {data.map((d, i) => (
            <Cell key={i} fill={d.color} />
          ))}
        </Pie>
        <Tooltip />
      </PieChart>
    </ResponsiveContainer>
  );
}

function ChartLegend({ items }: { items: { name: string; value: number; color: string }[] }) {
  return (
    <div className="mt-4 flex flex-wrap items-center justify-center gap-4">
      {items.map((it) => (
        <span key={it.name} className="inline-flex items-center gap-2 text-sm font-bold text-ink">
          <span className="h-3.5 w-3.5 rounded-[4px]" style={{ backgroundColor: it.color }} />
          {it.name} <span className="font-semibold text-smoke">({it.value})</span>
        </span>
      ))}
    </div>
  );
}

function Kpi({
  label,
  value,
  accent,
  warn,
  danger,
}: {
  label: string;
  value: string;
  accent?: boolean;
  warn?: boolean;
  danger?: boolean;
}) {
  return (
    <div
      className={`rounded-2xl border p-5 ${
        accent
          ? "border-transparent bg-ink text-white"
          : danger && value !== "0"
            ? "border-red-200 bg-red-50"
            : "border-line bg-white"
      }`}
    >
      <p className={`text-xs font-bold uppercase tracking-wide ${accent ? "text-white/50" : "text-smoke"}`}>
        {label}
      </p>
      <p
        className={`font-display mt-2 text-3xl font-black ${
          danger ? (value === "0" ? "text-ink" : "text-red-600") : warn ? "text-orange" : accent ? "text-white" : "text-ink"
        }`}
      >
        {value}
      </p>
    </div>
  );
}

function ChartCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-[1.5rem] border border-line bg-white p-5 sm:p-6">
      <h3 className="mb-4 font-display text-lg font-extrabold uppercase text-ink">{title}</h3>
      {children}
    </div>
  );
}
