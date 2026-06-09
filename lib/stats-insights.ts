import { euro } from "./pricing";

// Commentaires d'analyse DÉTERMINISTES (par règles, pas d'IA) sur la série des
// saisons. Ton factuel et neutre. Module pur (testable).

export type SaisonStat = {
  saison: string;
  ca: number;
  effectifs: number;
  enCours?: boolean; // saison en cours = incomplète → exclue des tendances
};

export function analyserSaisons(serie: SaisonStat[]): string[] {
  // On ne raisonne que sur les saisons COMPLÈTES (la saison en cours fausserait).
  const completes = [...serie]
    .filter((s) => !s.enCours)
    .sort((a, b) => a.saison.localeCompare(b.saison));
  if (completes.length === 0) return [];

  const out: string[] = [];

  // CA record / plus bas.
  const maxCa = completes.reduce((m, s) => (s.ca > m.ca ? s : m), completes[0]);
  const minCa = completes.reduce((m, s) => (s.ca < m.ca ? s : m), completes[0]);
  out.push(`CA record en ${maxCa.saison} (${euro(maxCa.ca)}).`);
  if (minCa.saison !== maxCa.saison)
    out.push(`CA le plus bas en ${minCa.saison} (${euro(minCa.ca)}).`);

  // Variation de la dernière saison complète vs la précédente (CA + effectifs).
  if (completes.length >= 2) {
    const last = completes[completes.length - 1];
    const prev = completes[completes.length - 2];
    if (prev.ca > 0) {
      const pct = Math.round(((last.ca - prev.ca) / prev.ca) * 100);
      out.push(`CA ${last.saison} : ${pct >= 0 ? "+" : ""}${pct} % vs ${prev.saison}.`);
    }
    const dEff = last.effectifs - prev.effectifs;
    out.push(
      `Effectifs ${last.saison} : ${dEff >= 0 ? "+" : ""}${dEff} vs ${prev.saison} (${last.effectifs} adhérents).`,
    );
  }

  // Tendance des effectifs : pic et évolution jusqu'à la dernière saison complète.
  if (completes.length >= 3) {
    const peak = completes.reduce((m, s) => (s.effectifs > m.effectifs ? s : m), completes[0]);
    const last = completes[completes.length - 1];
    if (peak.saison !== last.saison && last.effectifs < peak.effectifs) {
      out.push(
        `Effectifs en baisse depuis ${peak.saison} (${peak.effectifs} → ${last.effectifs}).`,
      );
    } else if (last.effectifs > completes[completes.length - 2].effectifs) {
      out.push(`Effectifs en hausse sur la dernière saison.`);
    }
  }

  // CA moyen par adhérent (dernière saison complète).
  const last = completes[completes.length - 1];
  if (last.effectifs > 0) {
    out.push(
      `CA moyen par adhérent en ${last.saison} : ~${euro(Math.round(last.ca / last.effectifs))}.`,
    );
  }

  return out;
}
