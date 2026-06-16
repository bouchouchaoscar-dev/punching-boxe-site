// AUDIT READ-ONLY de cohérence des dossiers de test. N'écrit RIEN.
// Recoupe : tarifs (cotisation/mois + dégressif + adhésion + remise famille),
// décompte foyer, CA encaissé net (après remboursements), statuts, migration
// (ancien_id / 30€ / exclusion relances), segments mailing (fermés exclus).
import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";
import { devisPourAdherent } from "../lib/tarifs";
import { deduireType, estMineur, remiseFamillePct, euro } from "../lib/pricing";
import { estActifCompte } from "../lib/adherents-actifs";
import { compteDansFoyer, compterFoyer } from "../lib/foyer";
import { evaluerDossier } from "../lib/dossier";
import { saisonCourante, saisonQuiSeTermine } from "../lib/saison";
import { doitPayerAdhesion, anneeDebutSaison } from "../lib/anciennete";

for (const line of readFileSync(".env.local", "utf8").split("\n")) {
  const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
}
const sb = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

const cents = (n: number) => Math.round(Number(n || 0) * 100);
const r2 = (n: number) => Math.round(n * 100) / 100;
let warns = 0;
const warn = (msg: string) => {
  warns++;
  console.log("  ⚠️ " + msg);
};
const ok = (msg: string) => console.log("  ✓ " + msg);
// Réf courte d'un dossier (prénom + 8 car. d'id) — pas de nom de famille.
const ref = (a: any) => `${a.prenom} (${String(a.id).slice(0, 8)})`;

const { data: adherents } = await sb.from("adherents").select("*");
const { data: paiements } = await sb.from("paiements").select("*");
const As = adherents ?? [];
const Ps = paiements ?? [];
console.log(`\n=== ${As.length} dossier(s), ${Ps.length} paiement(s) ===`);

// Index paiements par adhérent.
const payByAdh = new Map<string, any[]>();
for (const p of Ps) {
  const arr = payByAdh.get(p.adherent_id) ?? [];
  arr.push(p);
  payByAdh.set(p.adherent_id, arr);
}

// ───────── 1) TARIFS ─────────
console.log("\n───────── 1) TARIFS (montant_total recalculé) ─────────");
for (const a of As) {
  const createdAt = new Date(a.created_at);
  const saisonEnCours = a.saison === saisonQuiSeTermine(createdAt);
  const devis = devisPourAdherent(
    {
      date_naissance: a.date_naissance,
      package: a.package,
      nouveau_membre: a.nouveau_membre,
      option_prepa_physique: a.option_prepa_physique,
      nb_membres_famille: a.nb_membres_famille,
    },
    createdAt,
    saisonEnCours,
  );
  const typeAttendu = deduireType(a.date_naissance, createdAt);
  if (cents(devis.total) !== cents(a.montant_total)) {
    warn(
      `${ref(a)} : montant_total=${euro(a.montant_total)} ≠ recalcul ${euro(devis.total)} ` +
        `(cot ${euro(devis.cotisation)} + adh ${euro(devis.adhesion)} + prépa ${euro(devis.prepa)}, ${saisonEnCours ? "saison en cours" : "saison à venir"})`,
    );
  } else {
    ok(
      `${ref(a)} : ${euro(a.montant_total)} = cot ${euro(devis.cotisation)} + adh ${euro(devis.adhesion)} + prépa ${euro(devis.prepa)} [${typeAttendu}, rang ${a.nb_membres_famille + 1}]`,
    );
  }
  if (a.type_adherent && a.type_adherent !== typeAttendu)
    warn(`${ref(a)} : type_adherent=${a.type_adherent} ≠ recalcul ${typeAttendu}`);
}

// ───────── 2) FOYER / REMISE ─────────
console.log("\n───────── 2) FOYER (décompte + remise au bon rang) ─────────");
const foyers = new Map<string, any[]>();
for (const a of As) {
  const key = a.foyer_id ?? `t:${a.titulaire_id}`;
  const arr = foyers.get(key) ?? [];
  arr.push(a);
  foyers.set(key, arr);
}
for (const [key, membres] of foyers) {
  const comptes = membres.filter(compteDansFoyer);
  if (membres.length < 2) continue; // foyers mono : rien à signaler
  console.log(
    `  Foyer ${key.slice(0, 12)} : ${membres.length} dossier(s), ${comptes.length} compté(s) dans la remise`,
  );
  // Rang attendu = ordre d'engagement ; on vérifie surtout la remise vs nb_membres_famille stocké.
  for (const a of membres) {
    const remiseAttendue = remiseFamillePct(a.nb_membres_famille);
    const createdAt = new Date(a.created_at);
    const saisonEnCours = a.saison === saisonQuiSeTermine(createdAt);
    const devis = devisPourAdherent(
      {
        date_naissance: a.date_naissance,
        package: a.package,
        nouveau_membre: a.nouveau_membre,
        option_prepa_physique: a.option_prepa_physique,
        nb_membres_famille: a.nb_membres_famille,
      },
      createdAt,
      saisonEnCours,
    );
    const remiseEuro = r2(
      devis.cotisation /
        (1 - remiseAttendue / 100) -
        devis.cotisation,
    );
    console.log(
      `    - ${ref(a)} : rang ${a.nb_membres_famille + 1} → remise ${remiseAttendue}% (${remiseAttendue ? "−" + euro(remiseEuro) : "aucune"})${compteDansFoyer(a) ? "" : " [NE COMPTE PAS: " + (a.annule_at ? "fermé" : "non engagé") + "]"}`,
    );
  }
  // Cohérence des rangs : les nb_membres_famille des dossiers comptés doivent
  // être distincts et former une suite 0..n-1 (chacun voit ceux d'avant).
  const rangs = comptes.map((a) => a.nb_membres_famille).sort((x, y) => x - y);
  const attendu = rangs.map((_, i) => i).join(",");
  if (rangs.join(",") !== attendu)
    warn(
      `Foyer ${key.slice(0, 12)} : rangs incohérents [${rangs.join(",")}] (attendu [${attendu}]) — possible si créés hors ordre`,
    );
}

// ───────── 3) CA ENCAISSÉ NET ─────────
console.log("\n───────── 3) CA ENCAISSÉ NET (après remboursements) ─────────");
let caBrut = 0;
let rembTotal = 0;
for (const a of As) {
  const ps = payByAdh.get(a.id) ?? [];
  const payes = ps.filter((p) => p.statut === "paye" || p.statut === "rembourse");
  const brut = payes.reduce((s, p) => s + Number(p.montant || 0), 0);
  const remb = payes.reduce((s, p) => s + Number(p.montant_rembourse || 0), 0);
  const net = r2(brut - remb);
  caBrut += brut;
  rembTotal += remb;
  if (remb > 0 || a.annule_at || (a.montant_rembourse ?? 0) > 0) {
    const flagRemb =
      cents(remb) !== cents(a.montant_rembourse ?? 0)
        ? ` ⚠️ adherents.montant_rembourse=${euro(a.montant_rembourse ?? 0)} ≠ Σpaiements ${euro(remb)}`
        : "";
    console.log(
      `  ${ref(a)} : encaissé ${euro(brut)} − remb ${euro(remb)} = net ${euro(net)}${a.annule_at ? " [FERMÉ]" : ""}${flagRemb}`,
    );
    if (flagRemb) warns++;
  }
}
console.log(
  `  ───\n  CA brut ${euro(r2(caBrut))} − remboursé ${euro(r2(rembTotal))} = NET ${euro(r2(caBrut - rembTotal))}`,
);

// ───────── 4) STATUTS / DOSSIER ─────────
console.log("\n───────── 4) STATUTS (actif / remboursé / fermé + docs) ─────────");
for (const a of As) {
  const actif = estActifCompte(a);
  const dossier = evaluerDossier(a);
  const mineur = estMineur(a.date_naissance);
  const flags: string[] = [];
  if (a.annule_at) flags.push("FERMÉ");
  if ((a.montant_rembourse ?? 0) > 0) flags.push("remboursé " + euro(a.montant_rembourse));
  flags.push(actif ? "actif-compté" : "non-compté");
  flags.push(`docs ${dossier.valides}/4 (${dossier.statut})`);
  if (mineur) flags.push("MINEUR→autorisation");
  // Cohérence : fermé mais encore compté actif = anomalie.
  if (a.annule_at && actif) warn(`${ref(a)} : FERMÉ mais compté actif (anomalie)`);
  console.log(`  ${ref(a)} [${a.statut_paiement}/${a.mode_paiement}] : ${flags.join(", ")}`);
}

// ───────── 5) MIGRATION ─────────
console.log("\n───────── 5) MIGRATION (ancien_id, 30€, historique) ─────────");
const migres = As.filter((a) => a.ancien_id);
if (migres.length === 0) console.log("  (aucun dossier migré)");
for (const a of migres) {
  const { data: anc } = await sb
    .from("anciens_adherents")
    .select("id")
    .eq("id", a.ancien_id)
    .maybeSingle();
  if (!anc) {
    warn(`${ref(a)} : ancien_id=${a.ancien_id} INTROUVABLE dans anciens_adherents`);
    continue;
  }
  const { data: hist } = await sb
    .from("historique_saisons")
    .select("saison")
    .eq("ancien_id", a.ancien_id);
  const maxSaison = (hist ?? []).map((h) => h.saison).sort().reverse()[0] ?? null;
  const doitPayer = doitPayerAdhesion(maxSaison, a.saison);
  const gap = maxSaison
    ? anneeDebutSaison(a.saison) - anneeDebutSaison(maxSaison)
    : null;
  const coherent = a.nouveau_membre === doitPayer;
  const line = `${ref(a)} : ancien OK, dernière saison ${maxSaison ?? "—"} (gap ${gap ?? "?"}) → 30€ ${doitPayer ? "dû" : "exonéré"}, nouveau_membre=${a.nouveau_membre}`;
  coherent ? ok(line) : warn(line + " ❌ incohérent");
}

// ───────── 6) SEGMENTS MAILING ─────────
console.log("\n───────── 6) SEGMENTS (fermés exclus, migrés hors anciens) ─────────");
const saison = saisonCourante(new Date());
const actifsSaison = As.filter((a) => estActifCompte(a) && a.saison === saison);
const fermes = As.filter((a) => a.annule_at);
const fermeDansActifs = actifsSaison.filter((a) => a.annule_at);
ok(`Actifs saison ${saison} : ${actifsSaison.length} dossier(s)`);
fermeDansActifs.length === 0
  ? ok(`Fermés exclus du segment actifs (${fermes.length} fermé(s) hors liste)`)
  : warn(`${fermeDansActifs.length} dossier(s) FERMÉ(S) présents dans les actifs`);
// Migrés : leur ancien_id ne doit plus être relancé comme "ancien".
const ancienIdsMigres = new Set(migres.map((a) => a.ancien_id));
ok(`Anciens migrés (exclus des relances anciens) : ${ancienIdsMigres.size}`);

console.log(
  warns === 0
    ? "\n✅ AUDIT : aucune incohérence détectée."
    : `\n⚠️ AUDIT : ${warns} point(s) à vérifier ci-dessus.`,
);
