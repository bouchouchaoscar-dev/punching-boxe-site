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

const PX_PAR_HEURE = 60; // hauteur d'une heure dans la grille
// Amplitude d'agenda par défaut : journée complète 8h→22h (grille toujours
// affichée en entier, créneaux vides visibles), étendue si un cours déborde.
const HEURE_MIN_DEFAUT = 8;
const HEURE_MAX_DEFAUT = 22;

const minutes = (t: string | null) => {
  if (!t) return 0;
  const [h, m] = t.split(":").map(Number);
  return h * 60 + (m || 0);
};

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

  // Plage = journée complète (8h→22h) ÉTENDUE aux cours qui débordent, de sorte
  // que la grille soit affichée en entier (créneaux vides inclus), pas seulement
  // la tranche des cours existants.
  const { hMin, hMax } = useMemo(() => {
    let minH = HEURE_MIN_DEFAUT;
    let maxH = HEURE_MAX_DEFAUT;
    for (const c of cours) {
      if (!c.heure_debut || !c.heure_fin) continue;
      minH = Math.min(minH, Math.floor(minutes(c.heure_debut) / 60));
      maxH = Math.max(maxH, Math.ceil(minutes(c.heure_fin) / 60));
    }
    return { hMin: minH, hMax: maxH };
  }, [cours]);

  const heures = useMemo(
    () => Array.from({ length: hMax - hMin }, (_, i) => hMin + i),
    [hMin, hMax],
  );
  const hauteur = (hMax - hMin) * PX_PAR_HEURE;

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

      <ScrollX className="overflow-x-auto">
        <div className="min-w-[720px]">
          {/* En-têtes de jours */}
          <div
            className="grid border-b border-line"
            style={{ gridTemplateColumns: `3.5rem repeat(${jours.length}, minmax(0,1fr))` }}
          >
            <div />
            {jours.map((jv) => {
              const info = JOURS.find((j) => j.valeur === jv)!;
              const d = dateDuJour(semaineISO, jv);
              const iso = toISODate(d);
              const isToday = iso === todayISO;
              return (
                <div key={jv} className="px-2 py-2 text-center">
                  <div
                    className={`text-xs font-bold uppercase tracking-wide ${
                      isToday ? "text-orange" : "text-smoke"
                    }`}
                  >
                    {info.court}
                  </div>
                  <div className={`text-sm font-semibold ${isToday ? "text-orange" : "text-ink"}`}>
                    {d.getDate()}
                  </div>
                </div>
              );
            })}
          </div>

          {/* Corps : axe horaire + colonnes de jours */}
          <div
            className="grid"
            style={{ gridTemplateColumns: `3.5rem repeat(${jours.length}, minmax(0,1fr))` }}
          >
            {/* Axe des heures */}
            <div className="relative" style={{ height: hauteur }}>
              {heures.map((h, i) => (
                <div
                  key={h}
                  className="absolute right-2 -translate-y-1/2 text-[11px] font-medium text-smoke"
                  style={{ top: i * PX_PAR_HEURE }}
                >
                  {i === 0 ? "" : `${h}h`}
                </div>
              ))}
            </div>

            {/* Colonnes de jours */}
            {jours.map((jv) => {
              const d = dateDuJour(semaineISO, jv);
              const iso = toISODate(d);
              const ferme = estFerme(iso, periodes);
              const coursDuJour = cours
                .filter((c) => c.jour_semaine === jv && c.heure_debut && c.heure_fin)
                .sort((a, b) => minutes(a.heure_debut) - minutes(b.heure_debut));
              return (
                <div
                  key={jv}
                  className="relative border-l border-line"
                  style={{ height: hauteur }}
                >
                  {/* Lignes horaires */}
                  {heures.map((h, i) => (
                    <div
                      key={h}
                      className="absolute inset-x-0 border-t border-line/60"
                      style={{ top: i * PX_PAR_HEURE }}
                    />
                  ))}

                  {/* Voile "Fermé" si vacances */}
                  {ferme && (
                    <div className="absolute inset-0 z-10 flex items-center justify-center bg-paper-2/80 backdrop-blur-[1px]">
                      <span className="rotate-[-6deg] rounded-lg border border-line bg-white/90 px-2 py-1 text-center text-[11px] font-bold uppercase tracking-wide text-smoke shadow-sm">
                        Fermé
                        {ferme.libelle ? (
                          <span className="mt-0.5 block font-semibold normal-case text-smoke/80">
                            {ferme.libelle}
                          </span>
                        ) : null}
                      </span>
                    </div>
                  )}

                  {/* Cartes de cours */}
                  {!ferme &&
                    coursDuJour.map((c) => {
                      const top = ((minutes(c.heure_debut) - hMin * 60) / 60) * PX_PAR_HEURE;
                      const h = Math.max(
                        ((minutes(c.heure_fin) - minutes(c.heure_debut)) / 60) * PX_PAR_HEURE - 4,
                        26,
                      );
                      const aff = affParCours.get(c.id) ?? null;
                      const prof = aff?.prof_id ? profParId.get(aff.prof_id) : undefined;
                      const affecte = !!prof;
                      return (
                        <button
                          key={c.id}
                          onClick={() => onSelectCours(c, aff, iso, ferme)}
                          style={{ top, height: h }}
                          className={`absolute inset-x-1 z-[5] flex flex-col overflow-hidden rounded-lg border px-2 py-1 text-left transition-colors ${
                            affecte
                              ? "border-orange/40 bg-orange-50 hover:border-orange"
                              : "border-line bg-white hover:border-orange/50"
                          }`}
                        >
                          <span className="truncate text-[11px] font-bold leading-tight text-ink">
                            {c.libelle}
                          </span>
                          <span className="truncate text-[10px] leading-tight text-smoke">
                            {formatHeure(c.heure_debut)}–{formatHeure(c.heure_fin)}
                          </span>
                          {affecte ? (
                            <span className="mt-auto truncate text-[10px] font-semibold leading-tight text-orange">
                              {nomProf(prof)}
                            </span>
                          ) : (
                            <span className="mt-auto truncate text-[10px] leading-tight text-smoke/70">
                              + affecter
                            </span>
                          )}
                        </button>
                      );
                    })}
                </div>
              );
            })}
          </div>
        </div>
      </ScrollX>
    </div>
  );
}
