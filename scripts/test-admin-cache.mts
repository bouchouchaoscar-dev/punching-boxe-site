// Perf perçue Planning/Présence : cache de session + préchargement + gestion
// d'erreur. Exécuter : npx tsx scripts/test-admin-cache.mts
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

let ok = 0, ko = 0;
const check = (l: string, c: boolean, g?: unknown) => {
  if (c) { ok++; console.log(`  ✓ ${l}`); }
  else { ko++; console.log(`  ✗ ${l}` + (g !== undefined ? `  → ${JSON.stringify(g)}` : "")); }
};

// --- Polyfills navigateur minimaux (sessionStorage/localStorage + fetch) ---
class Mem {
  m = new Map<string, string>();
  getItem(k: string) { return this.m.has(k) ? this.m.get(k)! : null; }
  setItem(k: string, v: string) { this.m.set(k, String(v)); }
  removeItem(k: string) { this.m.delete(k); }
  clear() { this.m.clear(); }
}
const sessionStorage = new Mem();
(globalThis as unknown as { window: unknown }).window = { sessionStorage, localStorage: new Mem() };

let fetchOk = true;
const appels: string[] = [];
(globalThis as unknown as { fetch: unknown }).fetch = async (url: string) => {
  appels.push(String(url));
  return {
    ok: fetchOk,
    json: async () => ({ cours: [{ id: "c1" }], profs: [{ id: "p1" }], periodes: [{ id: "f1" }], affectations: [] }),
  };
};

const { lireCache, ecrireCache, CLES, prechargerOnglet } = await import("../lib/admin-cache");
const settle = () => new Promise((r) => setTimeout(r, 30));

console.log("\n== Cache de session (lire/écrire) ==");
ecrireCache("t.demo", { a: 1 });
check("écrit puis relit la même valeur", JSON.stringify(lireCache("t.demo")) === JSON.stringify({ a: 1 }));
check("clé absente → null (pas de crash)", lireCache("t.absent") === null);
check("préfixe isolé (pas de collision avec une clé brute)", sessionStorage.getItem("t.demo") === null && sessionStorage.getItem("pbnp.admin.cache.t.demo") !== null);

console.log("\n== Préchargement (réchauffe le cache) ==");
sessionStorage.clear();
fetchOk = true;
prechargerOnglet("/admin/presence", "admin");
prechargerOnglet("/admin/planning", "admin");
await settle();
check("présence admin : cache présent après préchargement", lireCache(CLES.presenceJour) !== null);
check("planning admin : profs/cours/périodes en cache", lireCache(CLES.planningProfs) !== null && lireCache(CLES.planningCours) !== null && lireCache(CLES.planningPeriodes) !== null);

sessionStorage.clear();
appels.length = 0;
prechargerOnglet("/admin/presence", "coach");
prechargerOnglet("/admin/planning", "coach");
await settle();
check("coach : endpoints coach appelés (pas les endpoints admin)", appels.some((u) => u.includes("/api/coach/presence")) && appels.some((u) => u.includes("/api/coach/planning")) && !appels.some((u) => u.includes("/api/admin/")));
check("coach présence : cache présent", lireCache(CLES.presenceCoach) !== null);

console.log("\n== Une requête en échec n'écrase JAMAIS le cache (pas de vide trompeur) ==");
sessionStorage.clear();
fetchOk = false;
prechargerOnglet("/admin/presence", "admin");
prechargerOnglet("/admin/planning", "admin");
await settle();
check("réponse !ok → aucun cache écrit (présence)", lireCache(CLES.presenceJour) === null);
check("réponse !ok → aucun cache écrit (planning)", lireCache(CLES.planningCours) === null);

console.log("\n== Garde-fous statiques (réutilisation des mécanismes) ==");
const here = dirname(fileURLToPath(import.meta.url));
const read = (p: string) => readFileSync(join(here, "..", p), "utf8");
const shell = read("components/admin/AdminShell.tsx");
check("AdminShell : préchargement au montage de l'espace admin", shell.includes("prechargerOnglet(\"/admin/presence\"") && shell.includes("prechargerOnglet(\"/admin/planning\""));
check("AdminShell : préchargement au survol/appui de l'entrée de menu", shell.includes("onMouseEnter={() => prechargerOnglet(n.href, role)}") && shell.includes("onPointerDown"));

const hook = read("components/admin/useDonneesAdmin.ts");
check("hook : hydrate depuis le cache (paint instantané)", hook.includes("lireCache"));
check("hook : rafraîchit + réécrit le cache", hook.includes("ecrireCache"));
check("hook : l'erreur remonte (jamais écrasée en vide)", hook.includes("setError"));

const presence = read("components/admin/Presence.tsx");
check("Présence : utilise le hook cache", presence.includes("useDonneesAdmin"));
check("Présence : garde le rafraîchissement auto 30 s", presence.includes("intervalMs: 30_000") || presence.includes("intervalMs: 30000"));
check("Présence : erreur affichée comme une erreur", presence.includes("ErreurPresence"));
check("Présence : squelette seulement si pas de données ET pas d'erreur", presence.includes("error ? <ErreurPresence") && presence.includes(": <Squelette />"));

const planning = read("app/admin/planning/page.tsx");
check("Planning : hydrate l'état depuis le cache", planning.includes("lireCache<Cours[]>(CLES.planningCours)"));
check("Planning : squelette instantané au 1er chargement", planning.includes("SquelettePlanning"));
check("Planning : erreur affichée comme une erreur (pas de calendrier vide)", planning.includes("ErreurPlanning"));
check("Planning : requêtes de base parallélisées (Promise.all)", planning.includes("Promise.all"));
check("Planning coach : cache de session via le hook", planning.includes("useDonneesAdmin"));

console.log(`\nRésultat : ${ok} OK / ${ko} KO`);
process.exit(ko === 0 ? 0 : 1);
