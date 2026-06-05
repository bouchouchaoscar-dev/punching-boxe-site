"use client";

import { useMemo } from "react";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { useAdherents } from "./useAdherents";
import { euro } from "@/lib/pricing";
import { CLUB } from "@/lib/constants";

const ORANGE = "#FF6B00";
const INK = "#0A0A0A";

export function Dashboard() {
  const { adherents, loading, error } = useAdherents();

  const data = useMemo(() => {
    const paid = adherents.filter(
      (a) => a.statut_paiement === "paye" || a.statut_paiement === "confirme_especes",
    );
    const now = new Date();
    const encaisse = paid.reduce((s, a) => s + Number(a.montant_total || 0), 0);
    const nouveauxMois = adherents.filter((a) => {
      const d = new Date(a.created_at);
      return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
    }).length;
    const attenteEspeces = adherents.filter(
      (a) => a.statut_paiement === "en_attente",
    ).length;
    const echecs = adherents.filter(
      (a) => a.statut_paiement === "echec_paiement",
    ).length;
    const formuleBoxe = adherents.filter(
      (a) => a.package === "boxe_classique" && !a.option_prepa_physique,
    ).length;
    const boxePrepa = adherents.filter(
      (a) => a.package === "boxe_classique" && a.option_prepa_physique,
    ).length;
    const savateForme = adherents.filter(
      (a) => a.package === "savate_prepa",
    ).length;

    // Les 12 mois de la saison (Juil → Juin), juillet/août inclus (à 0).
    const SEASON_LABELS = [
      "Juil", "Août", "Sept", "Oct", "Nov", "Déc",
      "Janv", "Févr", "Mars", "Avril", "Mai", "Juin",
    ];
    // Saison sportive EN COURS déduite de la date du jour (Juil→Juin) :
    // avant juillet on est encore dans la saison démarrée l'année précédente.
    // → garantit que les inscriptions du mois réel (created_at) tombent dans la fenêtre.
    const seasonStartYear =
      now.getMonth() >= 6 ? now.getFullYear() : now.getFullYear() - 1;
    const months = SEASON_LABELS.map((label, idx) => {
      const monthIndex = (6 + idx) % 12; // 0→Juil(6) … 6→Janv(0)
      const year = idx <= 5 ? seasonStartYear : seasonStartYear + 1;
      return { key: `${year}-${monthIndex}`, label };
    });
    const byMonth = months.map((m) => {
      const insc = adherents.filter((a) => {
        const d = new Date(a.created_at);
        return `${d.getFullYear()}-${d.getMonth()}` === m.key;
      });
      const montant = insc
        .filter((a) => a.statut_paiement !== "en_attente")
        .reduce((s, a) => s + Number(a.montant_total || 0), 0);
      return { mois: m.label, inscriptions: insc.length, montant };
    });

    const adultes = adherents.filter((a) => a.type_adherent === "adulte").length;
    const jeunes = adherents.filter((a) => a.type_adherent === "jeune").length;

    // Modes de paiement regroupés : en ligne (Stripe) vs espèces.
    const enLigne = adherents.filter((a) =>
      (a.mode_paiement ?? "").startsWith("stripe"),
    ).length;
    const especes = adherents.filter(
      (a) => a.mode_paiement === "especes",
    ).length;
    const repartitionMode = [
      { name: "Paiement en ligne", value: enLigne, color: ORANGE },
      { name: "Espèces", value: especes, color: INK },
    ].filter((x) => x.value > 0);

    // Répartition des formules.
    const boxe = adherents.filter((a) => a.package === "boxe_classique").length;
    const savate = adherents.filter((a) => a.package === "savate_prepa").length;
    const repartitionFormule = [
      { name: "Boxe Française", value: boxe, color: ORANGE },
      { name: "Savate & Prépa", value: savate, color: INK },
    ].filter((x) => x.value > 0);

    return {
      total: adherents.length,
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
      repartitionMode,
      repartitionFormule,
    };
  }, [adherents]);

  if (loading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <span className="h-8 w-8 animate-spin rounded-full border-2 border-ink/20 border-t-orange" />
      </div>
    );
  }

  return (
    <div>
      <div className="flex items-end justify-between">
        <div>
          <h1 className="font-display text-4xl font-black uppercase text-ink">
            Tableau de bord
          </h1>
          <p className="mt-1 text-smoke">Saison {CLUB.saison}</p>
        </div>
      </div>

      {error && (
        <div className="mt-6 rounded-xl bg-amber-50 p-4 text-sm text-amber-800">
          {error} — vérifiez la configuration Supabase.
        </div>
      )}

      {/* KPIs */}
      <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Kpi label="Adhérents" value={String(data.total)} accent />
        <Kpi label="Encaissé" value={euro(data.encaisse)} />
        <Kpi label="Nouveaux ce mois" value={String(data.nouveauxMois)} />
        <Kpi label="En attente espèces" value={String(data.attenteEspeces)} warn />
        <Kpi label="⚠️ Échecs paiement" value={String(data.echecs)} danger />
        <Kpi label="Formule Boxe" value={String(data.formuleBoxe)} />
        <Kpi label="Boxe + Prépa" value={String(data.boxePrepa)} />
        <Kpi label="Savate & Prépa" value={String(data.savateForme)} />
      </div>

      {data.total === 0 ? (
        <div className="mt-10 rounded-[1.5rem] border border-dashed border-line bg-white p-12 text-center">
          <p className="font-display text-2xl font-extrabold uppercase text-ink">
            Aucun adhérent
          </p>
          <p className="mx-auto mt-2 max-w-md text-sm text-smoke">
            Les inscriptions apparaîtront ici dès la première soumission du
            formulaire en ligne (Supabase doit être configuré).
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
                <Area
                  type="monotone"
                  dataKey="inscriptions"
                  stroke={ORANGE}
                  strokeWidth={2.5}
                  fill="url(#o)"
                />
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
            <ResponsiveContainer width="100%" height={220}>
              <PieChart>
                <Pie
                  data={data.typeData}
                  dataKey="value"
                  nameKey="name"
                  innerRadius={55}
                  outerRadius={85}
                  paddingAngle={3}
                >
                  {data.typeData.map((d, i) => (
                    <Cell key={i} fill={d.color} />
                  ))}
                </Pie>
                <Tooltip />
              </PieChart>
            </ResponsiveContainer>
            <ChartLegend items={data.typeData} />
          </ChartCard>

          <ChartCard title="Modes de paiement">
            <ResponsiveContainer width="100%" height={220}>
              <PieChart>
                <Pie
                  data={data.repartitionMode}
                  dataKey="value"
                  nameKey="name"
                  outerRadius={85}
                >
                  {data.repartitionMode.map((d, i) => (
                    <Cell key={i} fill={d.color} />
                  ))}
                </Pie>
                <Tooltip />
              </PieChart>
            </ResponsiveContainer>
            <ChartLegend items={data.repartitionMode} />
          </ChartCard>

          <ChartCard title="Répartition des formules">
            <ResponsiveContainer width="100%" height={220}>
              <PieChart>
                <Pie
                  data={data.repartitionFormule}
                  dataKey="value"
                  nameKey="name"
                  innerRadius={55}
                  outerRadius={85}
                  paddingAngle={3}
                >
                  {data.repartitionFormule.map((d, i) => (
                    <Cell key={i} fill={d.color} />
                  ))}
                </Pie>
                <Tooltip />
              </PieChart>
            </ResponsiveContainer>
            <ChartLegend items={data.repartitionFormule} />
          </ChartCard>
        </div>
      )}
    </div>
  );
}

function ChartLegend({
  items,
}: {
  items: { name: string; value: number; color: string }[];
}) {
  return (
    <div className="mt-4 flex flex-wrap items-center justify-center gap-4">
      {items.map((it) => (
        <span
          key={it.name}
          className="inline-flex items-center gap-2 text-sm font-bold text-ink"
        >
          <span
            className="h-3.5 w-3.5 rounded-[4px]"
            style={{ backgroundColor: it.color }}
          />
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
      <p
        className={`text-xs font-bold uppercase tracking-wide ${
          accent ? "text-white/50" : "text-smoke"
        }`}
      >
        {label}
      </p>
      <p
        className={`font-display mt-2 text-3xl font-black ${
          danger
            ? value === "0"
              ? "text-ink"
              : "text-red-600"
            : warn
              ? "text-orange"
              : accent
                ? "text-white"
                : "text-ink"
        }`}
      >
        {value}
      </p>
    </div>
  );
}

function ChartCard({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-[1.5rem] border border-line bg-white p-5 sm:p-6">
      <h3 className="mb-4 font-display text-lg font-extrabold uppercase text-ink">
        {title}
      </h3>
      {children}
    </div>
  );
}
