// [023] Agrégation PURE du suivi des essais (sous-onglet admin « Essais »). Sans
// I/O : la route fournit les lignes groupées, cette fonction dérive tout via
// statutEssai (source unique) — aucun statut recalculé ni stocké. Une personne =
// un essai (regroupement par triplet matchKey) ; la « première séance » est la plus
// ancienne. Les profs/cours/paiements sont résolus par la route et passés ici.
import { statutEssai, provenanceLabel, type StatutEssaiCode, type PaiementPourStatut } from "./statut-essai";
import { matchKey } from "./anciennete";
import { estMineur } from "./pricing";
import { CONFIG_CLUB } from "./config-club";

export type EssaiRow = {
  id: string;
  nom: string | null;
  prenom: string | null;
  date_naissance: string | null;
  email: string | null;
  telephone: string | null;
  provenance: string | null;
  provenance_autre: string | null;
  cours_id: string | null;
  date_seance: string;
  rappele_at: string | null;
  converti_dossier_id: string | null;
};
export type DossierRow = {
  id: string;
  annule_at: string | null;
  statut_paiement: string | null;
  echeances_payees: number | null;
};
export type Prof = { id: string; nom: string };

export type PersonneEssai = {
  essaiId: string;
  prenom: string;
  nom: string;
  mineur: boolean;
  premiereSeance: string;
  nbSeances: number;
  coursId: string | null;
  coursLabel: string;
  discipline: string | null;
  profs: Prof[];
  provenance: string | null;
  provenanceLabel: string;
  telephone: string | null;
  email: string | null;
  rappeleAt: string | null;
  dossierId: string | null;
  statut: StatutEssaiCode;
  inscrit: boolean;
  dateInscription: string | null;
  delaiJours: number | null;
};

export type LigneStat = {
  cle: string;
  label: string;
  essais: number;
  inscrits: number; // inscrits parmi les essais mûrs
  murs: number;
  taux: number | null; // inscritsMurs / murs
  echantillonFaible: boolean; // murs < 5 → taux peu fiable
  delaiMedian: number | null;
};

const MS = 86_400_000;
const isoJour = (d: Date) => d.toISOString().slice(0, 10);
function joursEntre(aISO: string, bISO: string): number {
  const a = Date.parse(`${aISO}T00:00:00Z`);
  const b = Date.parse(`${bISO}T00:00:00Z`);
  return Number.isNaN(a) || Number.isNaN(b) ? 0 : Math.round((b - a) / MS);
}
export function mediane(valeurs: number[]): number | null {
  const xs = valeurs.filter((v) => Number.isFinite(v)).sort((a, b) => a - b);
  if (xs.length === 0) return null;
  const mid = Math.floor(xs.length / 2);
  return xs.length % 2 ? xs[mid] : (xs[mid - 1] + xs[mid]) / 2;
}

const ECH_MIN = 5; // < 5 essais mûrs → « échantillon trop petit »

// Taux + médiane d'un groupe de personnes (sur les essais MÛRS uniquement).
function statGroupe(cle: string, label: string, personnes: PersonneEssai[], seuil: number, maintenantISO: string): LigneStat {
  const murs = personnes.filter((p) => joursEntre(p.premiereSeance, maintenantISO) >= seuil);
  const inscritsMurs = murs.filter((p) => p.inscrit);
  const delaiMedian = mediane(personnes.filter((p) => p.inscrit && p.delaiJours != null).map((p) => p.delaiJours as number));
  return {
    cle,
    label,
    essais: personnes.length,
    inscrits: inscritsMurs.length,
    murs: murs.length,
    taux: murs.length ? inscritsMurs.length / murs.length : null,
    echantillonFaible: murs.length > 0 && murs.length < ECH_MIN,
    delaiMedian,
  };
}

export type SuiviEssais = {
  personnes: PersonneEssai[];
  kpis: {
    essais: number;
    seances: number;
    inscrits: number;
    murs: number;
    inscritsMurs: number;
    taux: number | null;
    enCours: number; // essais de moins du seuil (exclus du taux)
    delaiMedian: number | null;
    aRappeler: number;
  };
  parMois: { mois: string; essais: number; inscrits: number; enCours: boolean }[];
  parProf: LigneStat[];
  parCours: LigneStat[];
  parProvenance: LigneStat[];
  provenanceNouveaux: { code: string; label: string; nombre: number }[];
};

export function construireSuiviEssais(input: {
  essais: EssaiRow[];
  dossierById: Map<string, DossierRow>;
  paiementsByDossier: Map<string, PaiementPourStatut[]>;
  coursLabel: (coursId: string | null) => string;
  coursDiscipline?: (coursId: string | null) => string | null;
  profsPourSeance: (coursId: string | null, dateISO: string) => Prof[];
  nouveauxSansEssai: { provenance: string | null; provenance_autre: string | null }[];
  maintenant: Date;
  config?: { conversionSeuilJours?: number };
}): SuiviEssais {
  const seuil = input.config?.conversionSeuilJours ?? CONFIG_CLUB.modules.presence.conversionSeuilJours ?? 14;
  const maintenantISO = isoJour(input.maintenant);

  // 1) Regrouper les essais par PERSONNE (triplet). matchKey null → clé = id.
  const groupes = new Map<string, EssaiRow[]>();
  for (const e of input.essais) {
    const cle = matchKey(e.nom ?? "", e.prenom ?? "", e.date_naissance) ?? `id:${e.id}`;
    (groupes.get(cle) ?? groupes.set(cle, []).get(cle)!).push(e);
  }

  const personnes: PersonneEssai[] = [];
  for (const essaisPers of groupes.values()) {
    const tri = [...essaisPers].sort((a, b) => a.date_seance.localeCompare(b.date_seance));
    const premier = tri[0];
    const converti = tri.map((e) => e.converti_dossier_id).find((x) => !!x) ?? null;
    const rappeleAt = tri.map((e) => e.rappele_at).filter((x): x is string => !!x).sort().reverse()[0] ?? null;
    const avecProv = tri.filter((e) => e.provenance).sort((a, b) => b.date_seance.localeCompare(a.date_seance))[0] ?? premier;
    const dossier = converti ? input.dossierById.get(converti) ?? null : null;
    const paiements = converti ? input.paiementsByDossier.get(converti) ?? [] : [];
    const st = statutEssai(
      { date_seance: premier.date_seance, converti_dossier_id: converti, rappele_at: rappeleAt },
      dossier,
      paiements,
      input.maintenant,
      { conversionSeuilJours: seuil },
    );
    personnes.push({
      essaiId: premier.id,
      prenom: premier.prenom ?? "",
      nom: premier.nom ?? "",
      mineur: estMineur(premier.date_naissance ?? ""),
      premiereSeance: premier.date_seance,
      nbSeances: tri.length,
      coursId: premier.cours_id,
      coursLabel: input.coursLabel(premier.cours_id),
      discipline: input.coursDiscipline ? input.coursDiscipline(premier.cours_id) : null,
      profs: input.profsPourSeance(premier.cours_id, premier.date_seance),
      provenance: avecProv.provenance ?? null,
      provenanceLabel: provenanceLabel(avecProv.provenance, avecProv.provenance_autre),
      telephone: premier.telephone,
      email: premier.email,
      rappeleAt,
      dossierId: converti,
      statut: st.code,
      inscrit: st.inscrit,
      dateInscription: st.dateInscription,
      delaiJours: st.delaiJours,
    });
  }

  // 2) KPIs globaux.
  const murs = personnes.filter((p) => joursEntre(p.premiereSeance, maintenantISO) >= seuil);
  const inscritsMurs = murs.filter((p) => p.inscrit);
  const kpis = {
    essais: personnes.length,
    seances: input.essais.length,
    inscrits: personnes.filter((p) => p.inscrit).length,
    murs: murs.length,
    inscritsMurs: inscritsMurs.length,
    taux: murs.length ? inscritsMurs.length / murs.length : null,
    enCours: personnes.filter((p) => joursEntre(p.premiereSeance, maintenantISO) < seuil).length,
    delaiMedian: mediane(personnes.filter((p) => p.inscrit && p.delaiJours != null).map((p) => p.delaiJours as number)),
    aRappeler: personnes.filter((p) => p.statut === "a_rappeler").length,
  };

  // 3) Par mois (bucket sur la première séance). Mois « en cours » s'il contient
  //    au moins un essai non encore mûr.
  const moisMap = new Map<string, { essais: number; inscrits: number; enCours: boolean }>();
  for (const p of personnes) {
    const mois = p.premiereSeance.slice(0, 7);
    const m = moisMap.get(mois) ?? { essais: 0, inscrits: 0, enCours: false };
    m.essais++;
    if (p.inscrit) m.inscrits++;
    if (joursEntre(p.premiereSeance, maintenantISO) < seuil) m.enCours = true;
    moisMap.set(mois, m);
  }
  const parMois = [...moisMap.entries()].sort((a, b) => a[0].localeCompare(b[0])).map(([mois, m]) => ({ mois, ...m }));

  // 4) Par prof (prof de la 1re séance ; plusieurs → compté pour chacun ; aucun → « non renseigné »).
  const profMap = new Map<string, { label: string; pers: PersonneEssai[] }>();
  for (const p of personnes) {
    const liste = p.profs.length ? p.profs.map((pr) => ({ cle: pr.id, label: pr.nom })) : [{ cle: "__aucun__", label: "Prof non renseigné" }];
    for (const { cle, label } of liste) {
      const g = profMap.get(cle) ?? { label, pers: [] };
      g.pers.push(p);
      profMap.set(cle, g);
    }
  }
  const parProf = [...profMap.entries()].map(([cle, g]) => statGroupe(cle, g.label, g.pers, seuil, maintenantISO)).sort((a, b) => b.essais - a.essais);

  // 5) Par cours.
  const coursMap = new Map<string, { label: string; pers: PersonneEssai[] }>();
  for (const p of personnes) {
    const cle = p.coursId ?? "__aucun__";
    const g = coursMap.get(cle) ?? { label: p.coursLabel || "Cours inconnu", pers: [] };
    g.pers.push(p);
    coursMap.set(cle, g);
  }
  const parCours = [...coursMap.entries()].map(([cle, g]) => statGroupe(cle, g.label, g.pers, seuil, maintenantISO)).sort((a, b) => b.essais - a.essais);

  // 6) Par provenance (essais), « Non renseigné » inclus.
  const provMap = new Map<string, { label: string; pers: PersonneEssai[] }>();
  for (const p of personnes) {
    const cle = p.provenance ?? "__none__";
    const label = p.provenance ? p.provenanceLabel : "Non renseigné";
    const g = provMap.get(cle) ?? { label, pers: [] };
    g.pers.push(p);
    provMap.set(cle, g);
  }
  const parProvenance = [...provMap.entries()].map(([cle, g]) => statGroupe(cle, g.label, g.pers, seuil, maintenantISO)).sort((a, b) => b.essais - a.essais);

  // 7) Provenance des NOUVEAUX adhérents de la saison SANS essai (vue complète).
  const nouvMap = new Map<string, { label: string; nombre: number }>();
  for (const a of input.nouveauxSansEssai) {
    const cle = a.provenance ?? "__none__";
    const label = a.provenance ? provenanceLabel(a.provenance, a.provenance_autre) : "Non renseigné";
    const g = nouvMap.get(cle) ?? { label, nombre: 0 };
    g.nombre++;
    nouvMap.set(cle, g);
  }
  const provenanceNouveaux = [...nouvMap.entries()].map(([code, g]) => ({ code, label: g.label, nombre: g.nombre })).sort((a, b) => b.nombre - a.nombre);

  return { personnes, kpis, parMois, parProf, parCours, parProvenance, provenanceNouveaux };
}

// Tri par défaut de la LISTE : À RAPPELER d'abord (plus anciens en tête), puis le
// reste par date de 1re séance décroissante.
export function trierPersonnes(personnes: PersonneEssai[]): PersonneEssai[] {
  return [...personnes].sort((a, b) => {
    const aR = a.statut === "a_rappeler", bR = b.statut === "a_rappeler";
    if (aR !== bR) return aR ? -1 : 1;
    if (aR && bR) return a.premiereSeance.localeCompare(b.premiereSeance); // plus anciens d'abord
    return b.premiereSeance.localeCompare(a.premiereSeance); // récents d'abord
  });
}
