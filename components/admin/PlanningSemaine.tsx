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
  couleurCours,
  disciplineLabel,
  publicLabel,
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
const bandeDe = (c: Cours) => Math.floor(minutes(c.heure_debut) / 60); // heure pleine de début

function nomProf(p: Prof | undefined): string {
  if (!p) return "";
  return [p.prenom, p.nom].filter(Boolean).join(" ").trim() || "Prof";
}

// Carte d'un cours — look IDENTIQUE partout (desktop bandes + mobile empilé).
function CarteCours({
  c,
  prof,
  onClick,
}: {
  c: Cours;
  prof: Prof | undefined;
  onClick: () => void;
}) {
  const col = couleurCours(c.discipline, c.type_adherent);
  return (
    <button
      onClick={onClick}
      style={{ backgroundColor: col.bg, borderLeftColor: col.bar }}
      className="w-full rounded-lg border border-l-4 border-line/60 px-2 py-1.5 text-left transition-transform hover:scale-[1.02]"
    >
      <div className="text-[12px] font-bold leading-tight text-ink">{c.libelle}</div>
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

  // Bandes horaires réellement utilisées (heure pleine de début), triées.
  const bandes = useMemo(() => {
    const set = new Set<number>();
    for (const c of cours) if (c.heure_debut) set.add(bandeDe(c));
    return [...set].sort((a, b) => a - b);
  }, [cours]);

  // Couples (discipline × public) présents → légende.
  const combos = useMemo(() => {
    const m = new Map<string, { discipline: string; type: string | null }>();
    for (const c of cours) {
      const k = `${c.discipline ?? ""}:${c.type_adherent ?? "tous"}`;
      if (!m.has(k)) m.set(k, { discipline: c.discipline ?? "", type: c.type_adherent ?? null });
    }
    return [...m.values()];
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

  const profDe = (c: Cours) => {
    const aff = affParCours.get(c.id) ?? null;
    return aff?.prof_id ? profParId.get(aff.prof_id) : undefined;
  };
  const clic = (c: Cours, iso: string, ferme: PeriodeFermeture | null) =>
    onSelectCours(c, affParCours.get(c.id) ?? null, iso, ferme);

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

  // Métadonnées par jour affiché (date, iso, aujourd'hui, fermeture).
  const infosJours = jours.map((jv) => {
    const d = dateDuJour(semaineISO, jv);
    const iso = toISODate(d);
    return {
      jv,
      court: JOURS.find((j) => j.valeur === jv)!.court,
      date: d.getDate(),
      iso,
      isToday: iso === todayISO,
      ferme: estFerme(iso, periodes),
    };
  });

  return (
    <div>
      {/* Barre de navigation semaine */}
      <div className="mb-3 flex items-center justify-between gap-3">
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

      {/* Légende — uniquement les couples réellement présents */}
      {combos.length > 0 && (
        <div className="mb-3 flex flex-wrap items-center gap-x-3 gap-y-1.5">
          {combos.map((cb) => {
            const col = couleurCours(cb.discipline, cb.type);
            const label = `${disciplineLabel(cb.discipline)}${cb.type ? ` · ${publicLabel(cb.type)}` : ""}`;
            return (
              <span key={`${cb.discipline}:${cb.type}`} className="flex items-center gap-1.5 text-xs text-smoke">
                <span
                  className="inline-block h-3 w-3 rounded-sm border"
                  style={{ backgroundColor: col.bg, borderColor: col.bar }}
                />
                {label}
              </span>
            );
          })}
        </div>
      )}

      {bandes.length === 0 ? (
        <p className="rounded-xl border border-dashed border-line bg-paper-2/40 py-8 text-center text-sm text-smoke">
          Aucun cours cette semaine.
        </p>
      ) : (
        <>
          {/* ============ DESKTOP (≥ md) : bandes horaires alignées ============ */}
          <div className="hidden md:block">
            <ScrollX className="overflow-x-auto pb-1">
              <div
                className="min-w-[640px]"
                style={{
                  display: "grid",
                  gridTemplateColumns: `3rem repeat(${jours.length}, minmax(150px, 1fr))`,
                }}
              >
                {/* Ligne d'en-tête (gouttière vide + jours) */}
                <div />
                {infosJours.map((it) => (
                  <div
                    key={it.jv}
                    className={`px-2 py-2 text-center ${
                      it.isToday ? "rounded-t-lg border-x-2 border-t-2 border-orange bg-orange-50" : ""
                    }`}
                  >
                    <div className={`text-xs font-bold uppercase tracking-wide ${it.isToday ? "text-orange" : "text-smoke"}`}>
                      {it.court}
                    </div>
                    <div className={`text-sm font-semibold ${it.isToday ? "text-orange" : "text-ink"}`}>
                      {it.date}
                    </div>
                    {it.ferme && (
                      <div className="mt-0.5 text-[10px] font-bold uppercase text-smoke/70">
                        Fermé
                      </div>
                    )}
                  </div>
                ))}

                {/* Une rangée par bande horaire */}
                {bandes.map((h, bi) => {
                  const dernier = bi === bandes.length - 1;
                  return (
                    <div key={h} style={{ display: "contents" }}>
                      {/* Gouttière : libellé d'heure discret */}
                      <div className="border-t border-line/40 pr-1 pt-1.5 text-right text-[11px] font-medium text-smoke/70">
                        {h}h
                      </div>
                      {infosJours.map((it) => {
                        const items = it.ferme
                          ? []
                          : cours
                              .filter((c) => c.jour_semaine === it.jv && bandeDe(c) === h)
                              .sort((a, b) => minutes(a.heure_debut) - minutes(b.heure_debut));
                        const todayCls = it.isToday
                          ? `border-x-2 border-orange bg-orange-50/40 ${dernier ? "rounded-b-lg border-b-2" : ""}`
                          : "border-t border-line/40";
                        return (
                          <div key={it.jv} className={`space-y-1.5 px-1.5 py-1.5 ${todayCls}`}>
                            {it.ferme ? null : items.length === 0 ? (
                              <div className="h-1" />
                            ) : (
                              items.map((c) => (
                                <CarteCours key={c.id} c={c} prof={profDe(c)} onClick={() => clic(c, it.iso, null)} />
                              ))
                            )}
                          </div>
                        );
                      })}
                    </div>
                  );
                })}
              </div>
            </ScrollX>
          </div>

          {/* ============ MOBILE (< md) : colonnes empilées par jour ============ */}
          <div className="md:hidden">
            <ScrollX className="overflow-x-auto pb-1">
              <div
                className="grid gap-2"
                style={{ gridTemplateColumns: `repeat(${jours.length}, minmax(140px, 1fr))` }}
              >
                {infosJours.map((it) => {
                  const coursDuJour = it.ferme
                    ? []
                    : cours
                        .filter((c) => c.jour_semaine === it.jv)
                        .sort((a, b) => minutes(a.heure_debut) - minutes(b.heure_debut));
                  return (
                    <div
                      key={it.jv}
                      className={`rounded-xl border ${it.isToday ? "border-orange" : "border-line"} bg-paper-2/40`}
                    >
                      <div
                        className={`rounded-t-xl border-b px-2 py-2 text-center ${
                          it.isToday ? "border-orange/40 bg-orange-50" : "border-line"
                        }`}
                      >
                        <div className={`text-xs font-bold uppercase tracking-wide ${it.isToday ? "text-orange" : "text-smoke"}`}>
                          {it.court}
                        </div>
                        <div className={`text-sm font-semibold ${it.isToday ? "text-orange" : "text-ink"}`}>
                          {it.date}
                        </div>
                      </div>
                      <div className="min-h-[64px] space-y-1.5 p-1.5">
                        {it.ferme ? (
                          <div className="flex min-h-[56px] items-center justify-center rounded-lg border border-dashed border-line bg-white/60 px-2 py-3 text-center">
                            <span className="text-[11px] font-bold uppercase tracking-wide text-smoke">
                              Fermé
                              {it.ferme.libelle ? (
                                <span className="mt-0.5 block font-semibold normal-case text-smoke/80">
                                  {it.ferme.libelle}
                                </span>
                              ) : null}
                            </span>
                          </div>
                        ) : coursDuJour.length === 0 ? (
                          <div className="py-3 text-center text-[11px] text-smoke/50">—</div>
                        ) : (
                          coursDuJour.map((c) => (
                            <CarteCours key={c.id} c={c} prof={profDe(c)} onClick={() => clic(c, it.iso, null)} />
                          ))
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </ScrollX>
          </div>
        </>
      )}
    </div>
  );
}
