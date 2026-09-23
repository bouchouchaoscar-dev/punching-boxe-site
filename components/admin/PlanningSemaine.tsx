"use client";

import { useMemo } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { ScrollX } from "@/components/ui/ScrollX";
import {
  JOURS,
  dateDuJour,
  toISODate,
  formatHeure,
  estFerme,
  type Cours,
  type Affectation,
  type Prof,
  type PeriodeFermeture,
} from "@/lib/planning";

const minutes = (t: string | null) => {
  if (!t) return 0;
  const [h, m] = t.split(":").map(Number);
  return h * 60 + (m || 0);
};

// Couleur douce par discipline (fond lisible + filet d'accent à gauche).
const COULEUR_DISCIPLINE: Record<string, { bg: string; bar: string }> = {
  boxe_francaise: { bg: "#fff4ec", bar: "#f84800" }, // orange charte
  savate: { bg: "#eef2ff", bar: "#4f46e5" }, // indigo
  prepa_physique: { bg: "#ecfdf5", bar: "#059669" }, // vert
};
const COULEUR_DEFAUT = { bg: "#f5f5f5", bar: "#9ca3af" };

function nomProf(p: Prof | undefined): string {
  if (!p) return "";
  return [p.prenom, p.nom].filter(Boolean).join(" ").trim() || "Prof";
}

export function PlanningSemaine({
  semaineISO,
  cours,
  affectations,
  profs,
  periodes,
  onPrev,
  onNext,
  onToday,
  onSelectCours,
}: {
  semaineISO: string;
  cours: Cours[];
  affectations: Affectation[];
  profs: Prof[];
  periodes: PeriodeFermeture[];
  onPrev: () => void;
  onNext: () => void;
  onToday: () => void;
  onSelectCours: (
    cours: Cours,
    affectation: Affectation | null,
    dateISO: string,
    ferme: PeriodeFermeture | null,
  ) => void;
}) {
  // Jours affichés : Lun→Ven, + Sam/Dim seulement si des cours actifs y existent.
  const jours = useMemo(() => {
    const base = JOURS.filter((j) => j.valeur <= 5).map((j) => j.valeur);
    const weekend = JOURS.filter(
      (j) => j.valeur >= 6 && cours.some((c) => c.jour_semaine === j.valeur),
    ).map((j) => j.valeur);
    return [...base, ...weekend];
  }, [cours]);

  const affParCours = useMemo(() => {
    const m = new Map<string, Affectation>();
    for (const a of affectations) m.set(a.cours_id, a);
    return m;
  }, [affectations]);

  const profParId = useMemo(() => {
    const m = new Map<string, Prof>();
    for (const p of profs) m.set(p.id, p);
    return m;
  }, [profs]);

  const lundi = dateDuJour(semaineISO, 1);
  const dimanche = dateDuJour(semaineISO, 7);
  const libelleSemaine = `${lundi.toLocaleDateString("fr-FR", {
    day: "numeric",
    month: "short",
  })} – ${dimanche.toLocaleDateString("fr-FR", {
    day: "numeric",
    month: "short",
    year: "numeric",
  })}`;

  const todayISO = toISODate(new Date());

  return (
    <div>
      {/* Barre de navigation semaine */}
      <div className="mb-4 flex items-center justify-between gap-3">
        <button
          onClick={onToday}
          className="rounded-full border border-line bg-white px-4 py-2 text-sm font-semibold text-ink hover:border-orange"
        >
          Aujourd&apos;hui
        </button>
        <div className="flex items-center gap-2">
          <button
            onClick={onPrev}
            aria-label="Semaine précédente"
            className="flex h-9 w-9 items-center justify-center rounded-full border border-line bg-white text-ink hover:border-orange hover:text-orange"
          >
            <ChevronLeft className="h-5 w-5" strokeWidth={2.2} />
          </button>
          <span className="min-w-[9.5rem] text-center text-sm font-bold text-ink">
            {libelleSemaine}
          </span>
          <button
            onClick={onNext}
            aria-label="Semaine suivante"
            className="flex h-9 w-9 items-center justify-center rounded-full border border-line bg-white text-ink hover:border-orange hover:text-orange"
          >
            <ChevronRight className="h-5 w-5" strokeWidth={2.2} />
          </button>
        </div>
      </div>

      {/* Agenda COMPACT : une colonne par jour, cartes de cours empilées.
          Pas d'axe horaire vide → tous les cours visibles d'un coup d'œil. */}
      <ScrollX className="overflow-x-auto pb-1">
        <div
          className="grid gap-2"
          style={{ gridTemplateColumns: `repeat(${jours.length}, minmax(140px, 1fr))` }}
        >
          {jours.map((jv) => {
            const info = JOURS.find((j) => j.valeur === jv)!;
            const d = dateDuJour(semaineISO, jv);
            const iso = toISODate(d);
            const isToday = iso === todayISO;
            const ferme = estFerme(iso, periodes);
            const coursDuJour = cours
              .filter((c) => c.jour_semaine === jv)
              .sort((a, b) => minutes(a.heure_debut) - minutes(b.heure_debut));

            return (
              <div
                key={jv}
                className={`rounded-xl border ${isToday ? "border-orange" : "border-line"} bg-paper-2/40`}
              >
                {/* En-tête de jour */}
                <div
                  className={`rounded-t-xl border-b px-2 py-2 text-center ${
                    isToday ? "border-orange/40 bg-orange-50" : "border-line"
                  }`}
                >
                  <div
                    className={`text-xs font-bold uppercase tracking-wide ${isToday ? "text-orange" : "text-smoke"}`}
                  >
                    {info.court}
                  </div>
                  <div className={`text-sm font-semibold ${isToday ? "text-orange" : "text-ink"}`}>
                    {d.getDate()}
                  </div>
                </div>

                {/* Contenu du jour */}
                <div className="min-h-[64px] space-y-1.5 p-1.5">
                  {ferme ? (
                    <div className="flex min-h-[56px] items-center justify-center rounded-lg border border-dashed border-line bg-white/60 px-2 py-3 text-center">
                      <span className="text-[11px] font-bold uppercase tracking-wide text-smoke">
                        Fermé
                        {ferme.libelle ? (
                          <span className="mt-0.5 block font-semibold normal-case text-smoke/80">
                            {ferme.libelle}
                          </span>
                        ) : null}
                      </span>
                    </div>
                  ) : coursDuJour.length === 0 ? (
                    <div className="py-3 text-center text-[11px] text-smoke/50">—</div>
                  ) : (
                    coursDuJour.map((c) => {
                      const aff = affParCours.get(c.id) ?? null;
                      const prof = aff?.prof_id ? profParId.get(aff.prof_id) : undefined;
                      const col = COULEUR_DISCIPLINE[c.discipline ?? ""] ?? COULEUR_DEFAUT;
                      return (
                        <button
                          key={c.id}
                          onClick={() => onSelectCours(c, aff, iso, ferme)}
                          style={{ backgroundColor: col.bg, borderLeftColor: col.bar }}
                          className="w-full rounded-lg border border-l-4 border-line/60 px-2 py-1.5 text-left transition-transform hover:scale-[1.02]"
                        >
                          <div className="text-[12px] font-bold leading-tight text-ink">
                            {c.libelle}
                          </div>
                          <div className="text-[11px] leading-tight text-ink/70">
                            {formatHeure(c.heure_debut)}–{formatHeure(c.heure_fin)}
                            {c.salle ? ` · ${c.salle}` : ""}
                          </div>
                          <div
                            className={`mt-0.5 truncate text-[11px] font-semibold leading-tight ${
                              prof ? "text-ink" : "text-smoke/70"
                            }`}
                          >
                            {prof ? `👤 ${nomProf(prof)}` : "+ affecter"}
                          </div>
                        </button>
                      );
                    })
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </ScrollX>
    </div>
  );
}
