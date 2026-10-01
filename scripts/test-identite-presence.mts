// Présence & essais : l'identité = nom + prénom + date de naissance (normalisés),
// JAMAIS l'email. Exécuter : npx tsx scripts/test-identite-presence.mts
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { memeIdentite, trouverDossierCorrespondant, attacherPresenceEssai, type DossierPresence } from "../lib/presence-server";

let ok = 0, ko = 0;
const check = (l: string, c: boolean, g?: unknown) => {
  if (c) { ok++; console.log(`  ✓ ${l}`); }
  else { ko++; console.log(`  ✗ ${l}` + (g !== undefined ? `  → ${JSON.stringify(g)}` : "")); }
};

console.log("\n== Identité = triplet normalisé (memeIdentite) ==");
check("variantes de saisie (casse/accents/espaces) → même personne",
  memeIdentite({ nom: "BOUCHOUCHA", prenom: "Léon", date_naissance: "2015-03-02" }, { nom: " bouchoucha ", prenom: "leon", date_naissance: "2015-03-02" }));
check("tiret / apostrophe normalisés → même personne",
  memeIdentite({ nom: "Saint-Pierre", prenom: "Anne-Lise", date_naissance: "2012-01-05" }, { nom: "saint pierre", prenom: "anne lise", date_naissance: "2012-01-05" }));
check("même prénom, date de naissance différente → personnes différentes",
  !memeIdentite({ nom: "Bouchoucha", prenom: "Ilan", date_naissance: "2015-03-02" }, { nom: "Bouchoucha", prenom: "Ilan", date_naissance: "2017-06-10" }));
check("fratrie (prénoms différents) → personnes différentes",
  !memeIdentite({ nom: "Bouchoucha", prenom: "Ilan", date_naissance: "2015-03-02" }, { nom: "Bouchoucha", prenom: "Ines", date_naissance: "2015-03-02" }));
check("date de naissance absente → jamais auto-identifié",
  !memeIdentite({ nom: "Bouchoucha", prenom: "Ilan", date_naissance: null }, { nom: "Bouchoucha", prenom: "Ilan", date_naissance: null }));

console.log("\n== Rattachement à un dossier : triplet UNIQUEMENT (jamais l'email) ==");
const D = (o: Partial<DossierPresence>): DossierPresence => ({
  id: "", prenom: null, nom: null, date_naissance: null, package: null, option_prepa_physique: null,
  photo_url: null, email: null, saison: "2026-2027", statut_paiement: null, mode_paiement: null,
  nb_echeances: null, echeances_payees: null, engage_at: null, annule_at: null, ...o,
});
const dossierIlan = D({ id: "D1", nom: "Bouchoucha", prenom: "Ilan", date_naissance: "2015-03-02", email: "parent@x.fr" });
check("même triplet → dossier trouvé", trouverDossierCorrespondant([dossierIlan], { nom: "BOUCHOUCHA", prenom: "ilan", date_naissance: "2015-03-02" })?.id === "D1");
check("même email, autre personne (sœur) → AUCUN dossier (pas de rattachement par email)",
  trouverDossierCorrespondant([dossierIlan], { nom: "Bouchoucha", prenom: "Ines", date_naissance: "2017-06-10" }) === null);

// ---- Intégration attacherPresenceEssai : faux Supabase en mémoire ----
function fakeSupabase() {
  const essais: Record<string, unknown>[] = [];
  const presences: Record<string, unknown>[] = [];
  let seq = 0;
  const thenable = (data: unknown) => ({ then: (r: (v: unknown) => unknown) => Promise.resolve({ data, error: null }).then(r) });
  const api = {
    from(table: string) {
      if (table === "essais") {
        return {
          select: () => thenable(essais.map((e) => ({ id: e.id, cours_id: e.cours_id, date_seance: e.date_seance, nom: e.nom, prenom: e.prenom, date_naissance: e.date_naissance }))),
          insert: (obj: Record<string, unknown>) => ({
            select: () => ({ single: async () => { const id = `e${++seq}`; essais.push({ id, ...obj }); return { data: { id }, error: null }; } }),
          }),
        };
      }
      return { insert: async (obj: Record<string, unknown>) => { presences.push(obj); return { error: null }; } };
    },
    _essais: essais, _presences: presences,
  };
  return api as unknown as Parameters<typeof attacherPresenceEssai>[0] & { _essais: Record<string, unknown>[]; _presences: Record<string, unknown>[] };
}

console.log("\n== Deux enfants, même email, même cours, même soir → deux essais, aucun « déjà utilisé » ==");
{
  const sb = fakeSupabase();
  const base = { coursId: "c1", dateSeance: "2026-10-01", email: "parent@x.fr", source: "manuel" as const, dossiers: [] };
  const a = await attacherPresenceEssai(sb, { ...base, prenom: "Ilan", nom: "Bouchoucha", date_naissance: "2015-03-02" });
  const b = await attacherPresenceEssai(sb, { ...base, prenom: "Ines", nom: "Bouchoucha", date_naissance: "2017-06-10" });
  check("enfant A : essai créé, pas « déjà utilisé »", a.ok && !a.surDossier && a.dejaUtilise === false, a);
  check("enfant B (même email) : essai créé, pas « déjà utilisé »", b.ok && !b.surDossier && b.dejaUtilise === false, b);
  check("deux essais DISTINCTS en base", sb._essais.length === 2 && a.ok && b.ok && a.essaiId !== b.essaiId);
}

console.log("\n== Même enfant qui revient (autre date) → « déjà utilisé » ==");
{
  const sb = fakeSupabase();
  const base = { coursId: "c1", email: "parent@x.fr", source: "manuel" as const, dossiers: [], prenom: "Ilan", nom: "Bouchoucha", date_naissance: "2015-03-02" };
  await attacherPresenceEssai(sb, { ...base, dateSeance: "2026-10-01" });
  const retour = await attacherPresenceEssai(sb, { ...base, dateSeance: "2026-10-08" });
  check("retour même personne → « déjà utilisé »", retour.ok && retour.dejaUtilise === true, retour);
  check("aucun second essai créé (réutilisation)", sb._essais.length === 1);
}

console.log("\n== Variantes de saisie → reconnu comme la même personne (anti-doublon) ==");
{
  const sb = fakeSupabase();
  const a = await attacherPresenceEssai(sb, { coursId: "c1", dateSeance: "2026-10-01", email: "parent@x.fr", source: "manuel", dossiers: [], prenom: "Ilan", nom: "Bouchoucha", date_naissance: "2015-03-02" });
  // Même personne, même cours, même date, saisie bruitée → doit réutiliser l'essai.
  const bruit = await attacherPresenceEssai(sb, { coursId: "c1", dateSeance: "2026-10-01", email: "autre@x.fr", source: "manuel", dossiers: [], prenom: "ILAN ", nom: " bouchoucha", date_naissance: "2015-03-02" });
  check("saisie bruitée (même triplet) → même essai réutilisé", a.ok && bruit.ok && a.essaiId === bruit.essaiId, { a, bruit });
  check("aucun doublon d'essai", sb._essais.length === 1);
}

console.log("\n== Rattachement au dossier : sur le triplet, jamais sur l'email du frère ==");
{
  const sb = fakeSupabase();
  const dossiers = [dossierIlan]; // dossier d'Ilan (email parent@x.fr)
  // La sœur Ines (même email que le dossier d'Ilan) ne doit PAS être rattachée à D1.
  const ines = await attacherPresenceEssai(sb, { coursId: "c1", dateSeance: "2026-10-01", email: "parent@x.fr", source: "manuel", dossiers, prenom: "Ines", nom: "Bouchoucha", date_naissance: "2017-06-10" });
  check("sœur (même email) → PAS rattachée au dossier du frère (essai créé)", ines.ok && ines.surDossier === false, ines);
  // Ilan lui-même (même triplet que D1) → rattaché au dossier.
  const ilan = await attacherPresenceEssai(sb, { coursId: "c1", dateSeance: "2026-10-01", email: "parent@x.fr", source: "manuel", dossiers, prenom: "Ilan", nom: "Bouchoucha", date_naissance: "2015-03-02" });
  check("la personne du dossier (même triplet) → rattachée au dossier", ilan.ok && ilan.surDossier === true && ilan.dossierId === "D1", ilan);
}

console.log("\n== Garde-fous statiques (cron relances / conversion) ==");
const here = dirname(fileURLToPath(import.meta.url));
const cron = readFileSync(join(here, "../app/api/cron/presence/route.ts"), "utf8");
check("conversion par le triplet uniquement (pas d'email dans trouverDossierCorrespondant)",
  /trouverDossierCorrespondant\(dossiers, \{\s*nom:/.test(cron) && !/trouverDossierCorrespondant\(dossiers, \{[^}]*email/.test(cron));
check("relances groupées par email + date de séance", cron.includes("${normaliserEmail(e.email)}|${e.date_seance}"));
check("claim idempotent PAR essai (.is(colClaim, null))", cron.includes(".is(colClaim, null)"));
check("un seul envoi par groupe (personnes: reserves.map…)", cron.includes("personnes: reserves.map"));

const essaiDossier = readFileSync(join(here, "../app/api/admin/presence/essai-dossier/route.ts"), "utf8");
check("badge fiche : rattachement par matchKey (pas par email)", essaiDossier.includes("matchKey(") && !/normaliserEmail/.test(essaiDossier));

console.log(`\nRésultat : ${ok} OK / ${ko} KO`);
process.exit(ko === 0 ? 0 : 1);
