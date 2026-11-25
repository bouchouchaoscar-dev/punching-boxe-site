import { NextResponse } from "next/server";
import { getSupabaseAdmin, isSupabaseConfigured, exigerData } from "@/lib/supabase";
import { isAdminRequest } from "@/lib/admin-guard";
import { saisonCourante } from "@/lib/saison";
import { matchKey } from "@/lib/anciennete";
import { construireSuiviEssais, trierPersonnes, type EssaiRow, type DossierRow, type Prof } from "@/lib/essais-stats";
import type { PaiementPourStatut } from "@/lib/statut-essai";

export const runtime = "nodejs";

// Lundi (ISO) de la semaine d'une date (UTC, sans dérive de fuseau).
function lundiISO(dateISO: string): string {
  const [y, m, d] = dateISO.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  const dow = dt.getUTCDay(); // 0=dim … 6=sam
  dt.setUTCDate(dt.getUTCDate() + (dow === 0 ? -6 : 1 - dow));
  return dt.toISOString().slice(0, 10);
}
// Plage [from,to] d'une saison "AAAA-BBBB" (01/09 → 31/08).
function plageSaison(saison: string): { from: string; to: string } {
  const [a, b] = saison.split("-").map(Number);
  return { from: `${a}-09-01`, to: `${b}-08-31` };
}

// GET /api/admin/presence/essais?from=&to=  (défaut : saison en cours)
// Renvoie les essais de la période + leur STATUT dérivé (statutEssai) + agrégats
// calculés serveur. Un seul aller-retour, requêtes GROUPÉES, exigerData partout.
// Admin only, fail-closed (le coach n'accède jamais à ces données).
export async function GET(request: Request) {
  if (!isAdminRequest(request)) return NextResponse.json({ error: "Non autorisé." }, { status: 401 });
  if (!isSupabaseConfigured()) return NextResponse.json({ error: "Supabase non configuré." }, { status: 503 });

  const sp = new URL(request.url).searchParams;
  const now = new Date();
  const saison = saisonCourante(now);
  const def = plageSaison(saison);
  const from = sp.get("from") || def.from;
  const to = sp.get("to") || def.to;
  const saisonRef = saisonCourante(new Date(`${to}T12:00:00Z`));

  const supabase = getSupabaseAdmin();

  // 1) Essais de la période (par date de séance). TOLÉRANT : si le cache de schéma
  //    PostgREST n'a pas encore intégré les colonnes 022, on retombe sur les colonnes
  //    de base (téléphone/provenance/rappel → null) → l'onglet marche quand même et
  //    s'enrichit dès le rafraîchissement du cache.
  const selFull = "id, nom, prenom, date_naissance, email, telephone, provenance, provenance_autre, cours_id, date_seance, rappele_at, converti_dossier_id";
  const selBase = "id, nom, prenom, date_naissance, email, cours_id, date_seance, converti_dossier_id";
  const resEssais = await supabase.from("essais").select(selFull).gte("date_seance", from).lte("date_seance", to);
  const essais = resEssais.error
    ? (((exigerData(
        await supabase.from("essais").select(selBase).gte("date_seance", from).lte("date_seance", to),
        "essais: liste période (base)",
      ) ?? []) as Record<string, unknown>[]).map((e) => ({ ...e, telephone: null, provenance: null, provenance_autre: null, rappele_at: null })) as EssaiRow[])
    : ((resEssais.data ?? []) as EssaiRow[]);

  // 2) Dossiers rattachés + leurs paiements (requêtes groupées).
  const dossierIds = [...new Set(essais.map((e) => e.converti_dossier_id).filter(Boolean))] as string[];
  const dossierById = new Map<string, DossierRow>();
  const paiementsByDossier = new Map<string, PaiementPourStatut[]>();
  if (dossierIds.length) {
    const dos = exigerData(
      await supabase.from("adherents").select("id, annule_at, statut_paiement, echeances_payees").in("id", dossierIds),
      "essais: dossiers liés",
    );
    for (const d of dos ?? []) dossierById.set(d.id as string, { id: d.id as string, annule_at: (d.annule_at as string | null) ?? null, statut_paiement: (d.statut_paiement as string | null) ?? null, echeances_payees: (d.echeances_payees as number | null) ?? null });
    const pays = exigerData(
      await supabase.from("paiements").select("adherent_id, statut, date_paiement").in("adherent_id", dossierIds),
      "essais: paiements dossiers",
    );
    for (const p of pays ?? []) {
      const k = p.adherent_id as string;
      (paiementsByDossier.get(k) ?? paiementsByDossier.set(k, []).get(k)!).push({ statut: (p.statut as string | null) ?? null, date_paiement: (p.date_paiement as string | null) ?? null });
    }
  }

  // 3) Cours (libellés) + affectations de profs sur la période (statut 'prevu').
  const coursRows = exigerData(await supabase.from("cours").select("id, libelle, discipline, heure_debut, heure_fin"), "essais: cours");
  const coursById = new Map((coursRows ?? []).map((c) => [c.id as string, c as Record<string, unknown>]));
  const coursLabel = (id: string | null) => {
    if (!id) return "Cours inconnu";
    const c = coursById.get(id);
    if (!c) return "Cours inconnu";
    const h = c.heure_debut ? String(c.heure_debut).slice(0, 5) : "";
    return `${(c.libelle as string) ?? "Cours"}${h ? ` · ${h}` : ""}`;
  };

  const lundiFrom = lundiISO(from);
  const affs = exigerData(
    await supabase.from("affectations").select("cours_id, semaine, prof_id, statut").gte("semaine", lundiFrom).lte("semaine", to),
    "essais: affectations",
  );
  const profsRows = exigerData(await supabase.from("profs").select("id, nom, prenom"), "essais: profs");
  const profNom = new Map((profsRows ?? []).map((p) => [p.id as string, `${(p.prenom as string) ?? ""} ${(p.nom as string) ?? ""}`.trim() || "Prof"]));
  const profsParSeance = new Map<string, Prof[]>();
  for (const a of affs ?? []) {
    if ((a.statut as string) === "annule") continue;
    const cle = `${a.cours_id}|${a.semaine}`;
    const prof: Prof = { id: a.prof_id as string, nom: profNom.get(a.prof_id as string) ?? "Prof" };
    (profsParSeance.get(cle) ?? profsParSeance.set(cle, []).get(cle)!).push(prof);
  }
  const profsPourSeance = (coursId: string | null, dateISO: string): Prof[] =>
    coursId ? profsParSeance.get(`${coursId}|${lundiISO(dateISO)}`) ?? [] : [];

  // 4) Provenance des NOUVEAUX adhérents de la saison SANS essai (vue complète).
  const clesEssais = new Set(essais.map((e) => matchKey(e.nom ?? "", e.prenom ?? "", e.date_naissance)).filter(Boolean) as string[]);
  // Tolérant si adherents.provenance (022) pas encore dans le cache PostgREST.
  const resNouveaux = await supabase.from("adherents").select("nom, prenom, date_naissance, provenance, provenance_autre").eq("saison", saisonRef).not("provenance", "is", null);
  const nouveaux = resNouveaux.error ? [] : (resNouveaux.data ?? []);
  const nouveauxSansEssai = (nouveaux ?? [])
    .filter((a) => {
      const k = matchKey(a.nom ?? "", a.prenom ?? "", a.date_naissance as string | null);
      return !k || !clesEssais.has(k);
    })
    .map((a) => ({ provenance: (a.provenance as string | null) ?? null, provenance_autre: (a.provenance_autre as string | null) ?? null }));

  const coursDiscipline = (id: string | null) => (id ? ((coursById.get(id)?.discipline as string | null) ?? null) : null);

  const suivi = construireSuiviEssais({
    essais,
    dossierById,
    paiementsByDossier,
    coursLabel,
    coursDiscipline,
    profsPourSeance,
    nouveauxSansEssai,
    maintenant: now,
  });

  return NextResponse.json({
    periode: { from, to, saison },
    personnes: trierPersonnes(suivi.personnes),
    kpis: suivi.kpis,
    parMois: suivi.parMois,
    parProf: suivi.parProf,
    parCours: suivi.parCours,
    parProvenance: suivi.parProvenance,
    provenanceNouveaux: suivi.provenanceNouveaux,
  });
}
