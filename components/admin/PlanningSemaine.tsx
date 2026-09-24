"use client";

import { useMemo, type ReactNode, type MouseEvent as ReactMouseEvent } from "react";
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
const bandeDe = (c: Cours) => Math.floor(minutes(c.heure_debut) / 60);

function nomProf(p: Prof): string {
  return [p.prenom, p.nom].filter(Boolean).join(" ").trim() || "Prof";
}

// Case grisée "Fermé · nom" (à l'emplacement d'un cours, jour fermé).
function CaseFermee({ libelle }: { libelle: string | null }) {
  return (
    <div className="rounded-lg border border-dashed border-line bg-paper-2 px-2 py-1.5 text-center">
      <span className="text-[11px] font-bold uppercase tracking-wide text-smoke">Fermé</span>
      {libelle ? <span className="block text-[10px] text-smoke/80">{libelle}</span> : null}
    </div>
  );
}

// Icônes (même famille/ taille que l'enveloppe : h-3 w-3, trait 2).
function IconeEnveloppe() {
  return (
    <svg viewBox="0 0 24 24" className="h-3 w-3" fill="none" stroke="currentColor" strokeWidth="2">
      <rect x="3" y="5" width="18" height="14" rx="2" />
      <path d="m3 7 9 6 9-6" />
    </svg>
  );
}
function IconePersonne() {
  return (
    <svg viewBox="0 0 24 24" className="h-3 w-3" fill="none" stroke="currentColor" strokeWidth="2">
      <circle cx="12" cy="8" r="3.2" />
      <path d="M5.5 20a6.5 6.5 0 0 1 13 0" />
    </svg>
  );
}

// Petit bouton d'action de carte — FACTORISÉ (variante accent / neutre).
// Même hauteur, arrondi, taille de texte/icône, padding, survol et focus.
function BoutonCarte({
  variant,
  onClick,
  icon,
  label,
  title,
}: {
  variant: "accent" | "neutre";
  onClick: (e: ReactMouseEvent) => void;
  icon: ReactNode;
  label: string;
  title: string;
}) {
  const styles =
    variant === "accent"
      ? "border-orange/40 bg-orange-50 text-orange hover:border-orange"
      : "border-line bg-white text-ink/70 hover:border-ink/40";
  return (
    <button
      onClick={onClick}
      title={title}
      aria-label={title}
      className={`focus-ring inline-flex min-w-16 flex-1 items-center justify-center gap-1 rounded-full border px-2 py-1 text-[10px] font-bold transition-all hover:-translate-y-0.5 hover:shadow-sm ${styles}`}
    >
      {icon}
      {label}
    </button>
  );
}

// Carte d'un cours — multi-profs, look identique desktop/mobile.
function CarteCours({
  c,
  profsDuCours,
  selectionMode,
  selected,
  onToggleSelect,
  onAddProf,
  onRemoveProf,
  onPrevenir,
}: {
  c: Cours;
  profsDuCours: Prof[];
  selectionMode: boolean;
  selected: boolean;
  onToggleSelect: (coursId: string) => void;
  onAddProf: (coursId: string) => void;
  onRemoveProf: (coursId: string, profId: string) => void;
  onPrevenir: (c: Cours) => void;
}) {
  const col = couleurCours(c.discipline, c.type_adherent);
  return (
    <div
      style={{ backgroundColor: col.bg, borderLeftColor: col.bar }}
      className={`relative rounded-lg border border-l-4 border-line/60 px-2 py-1.5 ${
        selectionMode ? "cursor-pointer" : ""
      } ${selected ? "ring-2 ring-orange" : ""}`}
      onClick={selectionMode ? () => onToggleSelect(c.id) : undefined}
    >
      {selectionMode && (
        <span
          className={`absolute right-1.5 top-1.5 flex h-4 w-4 items-center justify-center rounded border text-[10px] ${
            selected ? "border-orange bg-orange text-white" : "border-smoke/40 bg-white"
          }`}
        >
          {selected ? "✓" : ""}
        </span>
      )}
      <div className="pr-5 text-[12px] font-bold leading-tight text-ink">{c.libelle}</div>
      <div className="text-[11px] leading-tight text-ink/70">
        {formatHeure(c.heure_debut)}–{formatHeure(c.heure_fin)}
        {c.salle ? ` · ${c.salle}` : ""}
      </div>

      {/* Profs affectés (chips avec croix de retrait) — inchangés */}
      {profsDuCours.length > 0 && (
        <div className="mt-1 flex flex-wrap gap-1">
          {profsDuCours.map((p) => (
            <span
              key={p.id}
              className="inline-flex items-center gap-0.5 rounded-full bg-white/70 px-1.5 py-0.5 text-[10px] font-semibold text-ink"
            >
              {nomProf(p)}
              {!selectionMode && (
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    onRemoveProf(c.id, p.id);
                  }}
                  aria-label={`Retirer ${nomProf(p)}`}
                  className="ml-0.5 text-smoke hover:text-red-600"
                >
                  ×
                </button>
              )}
            </span>
          ))}
        </div>
      )}

      {/* Actions : paire uniformisée (Prof neutre / Prévenir accent) */}
      {!selectionMode && (
        <div className="mt-1.5 flex flex-wrap gap-1">
          <BoutonCarte
            variant="neutre"
            onClick={(e) => {
              e.stopPropagation();
              onAddProf(c.id);
            }}
            icon={<IconePersonne />}
            label="Prof"
            title="Ajouter un professeur"
          />
          <BoutonCarte
            variant="accent"
            onClick={(e) => {
              e.stopPropagation();
              onPrevenir(c);
            }}
            icon={<IconeEnveloppe />}
            label="Prévenir"
            title="Prévenir les adhérents de ce cours"
          />
        </div>
      )}
    </div>
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
  selectionMode,
  selected,
  onToggleSelect,
  onAddProf,
  onRemoveProf,
  onPrevenir,
}: {
  semaineISO: string;
  cours: Cours[];
  affectations: Affectation[];
  profs: Prof[];
  periodes: PeriodeFermeture[];
  onPrev: () => void;
  onNext: () => void;
  onToday: () => void;
  selectionMode: boolean;
  selected: Set<string>;
  onToggleSelect: (coursId: string) => void;
  onAddProf: (coursId: string) => void;
  onRemoveProf: (coursId: string, profId: string) => void;
  onPrevenir: (c: Cours) => void;
}) {
  // Jours affichés : Lun→Ven, + Sam/Dim si des cours actifs y existent.
  const jours = useMemo(() => {
    const base = JOURS.filter((j) => j.valeur <= 5).map((j) => j.valeur);
    const weekend = JOURS.filter(
      (j) => j.valeur >= 6 && cours.some((c) => c.jour_semaine === j.valeur),
    ).map((j) => j.valeur);
    return [...base, ...weekend];
  }, [cours]);

  // Bandes = heures pleines de TOUS les cours de la grille (forme stable toute l'année).
  const bandes = useMemo(() => {
    const set = new Set<number>();
    for (const c of cours) if (c.heure_debut) set.add(bandeDe(c));
    return [...set].sort((a, b) => a - b);
  }, [cours]);

  const combos = useMemo(() => {
    const m = new Map<string, { discipline: string; type: string | null }>();
    for (const c of cours) {
      const k = `${c.discipline ?? ""}:${c.type_adherent ?? "tous"}`;
      if (!m.has(k)) m.set(k, { discipline: c.discipline ?? "", type: c.type_adherent ?? null });
    }
    return [...m.values()];
  }, [cours]);

  const profById = useMemo(() => {
    const m = new Map<string, Prof>();
    for (const p of profs) m.set(p.id, p);
    return m;
  }, [profs]);
  // profs affectés par cours (pour la semaine affichée), triés par nom.
  const profsParCours = useMemo(() => {
    const m = new Map<string, Prof[]>();
    for (const a of affectations) {
      if (!a.prof_id) continue;
      const p = profById.get(a.prof_id);
      if (!p) continue;
      const arr = m.get(a.cours_id) ?? [];
      arr.push(p);
      m.set(a.cours_id, arr);
    }
    for (const arr of m.values()) arr.sort((x, y) => nomProf(x).localeCompare(nomProf(y)));
    return m;
  }, [affectations, profById]);

  const lundi = dateDuJour(semaineISO, 1);
  const dimanche = dateDuJour(semaineISO, 7);
  const libelleSemaine = `${lundi.toLocaleDateString("fr-FR", { day: "numeric", month: "short" })} – ${dimanche.toLocaleDateString("fr-FR", { day: "numeric", month: "short", year: "numeric" })}`;
  const todayISO = toISODate(new Date());

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

  const carte = (c: Cours) => (
    <CarteCours
      key={c.id}
      c={c}
      profsDuCours={profsParCours.get(c.id) ?? []}
      selectionMode={selectionMode}
      selected={selected.has(c.id)}
      onToggleSelect={onToggleSelect}
      onAddProf={onAddProf}
      onRemoveProf={onRemoveProf}
      onPrevenir={onPrevenir}
    />
  );

  return (
    <div>
      {/* Navigation semaine */}
      <div className="mb-3 flex items-center justify-between gap-3">
        <button
          onClick={onToday}
          className="rounded-full border border-line bg-white px-4 py-2 text-sm font-semibold text-ink hover:border-orange"
        >
          Aujourd&apos;hui
        </button>
        <div className="flex items-center gap-2">
          <button onClick={onPrev} aria-label="Semaine précédente" className="flex h-9 w-9 items-center justify-center rounded-full border border-line bg-white text-ink hover:border-orange hover:text-orange">
            <ChevronLeft className="h-5 w-5" strokeWidth={2.2} />
          </button>
          <span className="min-w-[9.5rem] text-center text-sm font-bold text-ink">{libelleSemaine}</span>
          <button onClick={onNext} aria-label="Semaine suivante" className="flex h-9 w-9 items-center justify-center rounded-full border border-line bg-white text-ink hover:border-orange hover:text-orange">
            <ChevronRight className="h-5 w-5" strokeWidth={2.2} />
          </button>
        </div>
      </div>

      {/* Légende */}
      {combos.length > 0 && (
        <div className="mb-3 flex flex-wrap items-center gap-x-3 gap-y-1.5">
          {combos.map((cb) => {
            const col = couleurCours(cb.discipline, cb.type);
            const label = `${disciplineLabel(cb.discipline)}${cb.type ? ` · ${publicLabel(cb.type)}` : ""}`;
            return (
              <span key={`${cb.discipline}:${cb.type}`} className="flex items-center gap-1.5 text-xs text-smoke">
                <span className="inline-block h-3 w-3 rounded-sm border" style={{ backgroundColor: col.bg, borderColor: col.bar }} />
                {label}
              </span>
            );
          })}
        </div>
      )}

      {bandes.length === 0 ? (
        <p className="rounded-xl border border-dashed border-line bg-paper-2/40 py-8 text-center text-sm text-smoke">
          Aucun cours dans la grille. Ajoutez des cours dans l&apos;onglet « Cours ».
        </p>
      ) : (
        <>
          {/* DESKTOP : bandes horaires */}
          <div className="hidden md:block">
            <ScrollX className="overflow-x-auto pb-1">
              <div className="min-w-[640px]" style={{ display: "grid", gridTemplateColumns: `3rem repeat(${jours.length}, minmax(150px, 1fr))` }}>
                <div />
                {infosJours.map((it) => (
                  <div key={it.jv} className={`px-2 py-2 text-center ${it.isToday ? "rounded-t-lg border-x-2 border-t-2 border-orange bg-orange-50" : ""}`}>
                    <div className={`text-xs font-bold uppercase tracking-wide ${it.isToday ? "text-orange" : "text-smoke"}`}>{it.court}</div>
                    <div className={`text-sm font-semibold ${it.isToday ? "text-orange" : "text-ink"}`}>{it.date}</div>
                  </div>
                ))}
                {bandes.map((h, bi) => {
                  const dernier = bi === bandes.length - 1;
                  return (
                    <div key={h} style={{ display: "contents" }}>
                      <div className="border-t border-line/40 pr-1 pt-1.5 text-right text-[11px] font-medium text-smoke/70">{h}h</div>
                      {infosJours.map((it) => {
                        const items = cours
                          .filter((c) => c.jour_semaine === it.jv && bandeDe(c) === h)
                          .sort((a, b) => minutes(a.heure_debut) - minutes(b.heure_debut));
                        const todayCls = it.isToday
                          ? `border-x-2 border-orange bg-orange-50/40 ${dernier ? "rounded-b-lg border-b-2" : ""}`
                          : "border-t border-line/40";
                        return (
                          <div key={it.jv} className={`space-y-1.5 px-1.5 py-1.5 ${todayCls}`}>
                            {items.length === 0 ? (
                              <div className="h-1" />
                            ) : it.ferme ? (
                              items.map((c) => <CaseFermee key={c.id} libelle={it.ferme!.libelle} />)
                            ) : (
                              items.map(carte)
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

          {/* MOBILE : colonnes empilées */}
          <div className="md:hidden">
            <ScrollX className="overflow-x-auto pb-1">
              <div className="grid gap-2" style={{ gridTemplateColumns: `repeat(${jours.length}, minmax(150px, 1fr))` }}>
                {infosJours.map((it) => {
                  const coursDuJour = cours
                    .filter((c) => c.jour_semaine === it.jv)
                    .sort((a, b) => minutes(a.heure_debut) - minutes(b.heure_debut));
                  return (
                    <div key={it.jv} className={`rounded-xl border ${it.isToday ? "border-orange" : "border-line"} bg-paper-2/40`}>
                      <div className={`rounded-t-xl border-b px-2 py-2 text-center ${it.isToday ? "border-orange/40 bg-orange-50" : "border-line"}`}>
                        <div className={`text-xs font-bold uppercase tracking-wide ${it.isToday ? "text-orange" : "text-smoke"}`}>{it.court}</div>
                        <div className={`text-sm font-semibold ${it.isToday ? "text-orange" : "text-ink"}`}>{it.date}</div>
                      </div>
                      <div className="min-h-[64px] space-y-1.5 p-1.5">
                        {coursDuJour.length === 0 ? (
                          <div className="py-3 text-center text-[11px] text-smoke/50">—</div>
                        ) : it.ferme ? (
                          coursDuJour.map((c) => <CaseFermee key={c.id} libelle={it.ferme!.libelle} />)
                        ) : (
                          coursDuJour.map(carte)
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
