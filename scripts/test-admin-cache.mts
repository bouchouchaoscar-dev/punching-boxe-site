// Perf perçue Planning/Présence : cache de session + préchargement + gestion
// d'erreur, ET confidentialité (purge à la déconnexion, isolation par rôle).
// Exécuter : npx tsx scripts/test-admin-cache.mts
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
  get length() { return this.m.size; }
  key(i: number) { return [...this.m.keys()][i] ?? null; }
  getItem(k: string) { return this.m.has(k) ? this.m.get(k)! : null; }
  setItem(k: string, v: string) { this.m.set(k, String(v)); }
  removeItem(k: string) { this.m.delete(k); }
  clear() { this.m.clear(); }
}
const sessionStorage = new Mem();
const localStorage = new Mem();
(globalThis as unknown as { window: unknown }).window = { sessionStorage, localStorage };
const ROLE_KEY = "pbnp_admin_role";
const setRole = (r: string | null) => { if (r) localStorage.setItem(ROLE_KEY, r); else localStorage.removeItem(ROLE_KEY); };

let fetchOk = true;
const appels: string[] = [];
(globalThis as unknown as { fetch: unknown }).fetch = async (url: string) => {
  appels.push(String(url));
  return {
    ok: fetchOk,
    json: async () => ({ cours: [{ id: "c1" }], profs: [{ id: "p1" }], periodes: [{ id: "f1" }], affectations: [] }),
  };
};

const { lireCache, ecrireCache, purgerCache, CLES, prechargerOnglet } = await import("../lib/admin-cache");
const settle = () => new Promise((r) => setTimeout(r, 30));

console.log("\n== Cache de session (lire/écrire), rôle admin ==");
setRole("admin");
ecrireCache("t.demo", { a: 1 });
check("écrit puis relit la même valeur", JSON.stringify(lireCache("t.demo")) === JSON.stringify({ a: 1 }));
check("clé absente → null (pas de crash)", lireCache("t.absent") === null);
check("clé réellement PRÉFIXÉE PAR LE RÔLE", sessionStorage.getItem("pbnp.admin.cache.admin.t.demo") !== null);

console.log("\n== Rôle inconnu (déconnecté) → aucun cache ==");
setRole(null);
ecrireCache("t.rien", { x: 1 });
check("écriture sans rôle → rien de stocké", sessionStorage.getItem("pbnp.admin.cache..t.rien") === null && lireCache("t.rien") === null);

console.log("\n== Isolation par rôle : un coach ne lit JAMAIS le cache admin ==");
sessionStorage.clear();
setRole("admin");
ecrireCache("presence.jour", [{ nom: "MINEUR" }]); // donnée personnelle admin
check("admin a bien écrit son cache", lireCache("presence.jour") !== null);
setRole("coach");
check("coach : lecture de la même clé → null (illisible)", lireCache("presence.jour") === null);
check("aucune clé coach n'a été créée en lisant", sessionStorage.getItem("pbnp.admin.cache.coach.presence.jour") === null);
check("la clé admin existe toujours en brut mais reste hors de portée du coach", sessionStorage.getItem("pbnp.admin.cache.admin.presence.jour") !== null);

console.log("\n== Purge = déconnexion : cache entièrement vide ==");
setRole("admin"); ecrireCache("a.k", 1);
setRole("coach"); ecrireCache("c.k", 2);
purgerCache();
check("après purge : plus AUCUNE clé de cache (tous rôles)", [...sessionStorage.m.keys()].filter((k) => k.startsWith("pbnp.admin.cache.")).length === 0);
setRole("admin");
check("après purge : lecture admin → null", lireCache("a.k") === null);
setRole("coach");
check("après purge : lecture coach → null", lireCache("c.k") === null);

console.log("\n== Préchargement (réchauffe le cache du bon rôle) ==");
sessionStorage.clear();
fetchOk = true;
setRole("admin");
prechargerOnglet("/admin/presence", "admin");
prechargerOnglet("/admin/planning", "admin");
await settle();
check("présence admin : cache présent", lireCache(CLES.presenceJour) !== null);
check("planning admin : profs/cours/périodes en cache", lireCache(CLES.planningProfs) !== null && lireCache(CLES.planningCours) !== null && lireCache(CLES.planningPeriodes) !== null);

sessionStorage.clear();
appels.length = 0;
setRole("coach");
prechargerOnglet("/admin/presence", "coach");
prechargerOnglet("/admin/planning", "coach");
await settle();
check("coach : endpoints coach uniquement (jamais /api/admin/)", appels.some((u) => u.includes("/api/coach/presence")) && appels.some((u) => u.includes("/api/coach/planning")) && !appels.some((u) => u.includes("/api/admin/")));
check("coach présence : cache présent (clé coach)", lireCache(CLES.presenceCoach) !== null && sessionStorage.getItem(`pbnp.admin.cache.coach.${CLES.presenceCoach}`) !== null);

console.log("\n== Une requête en échec n'écrase JAMAIS le cache ==");
sessionStorage.clear();
fetchOk = false;
setRole("admin");
prechargerOnglet("/admin/presence", "admin");
prechargerOnglet("/admin/planning", "admin");
await settle();
check("réponse !ok → aucun cache écrit (présence)", lireCache(CLES.presenceJour) === null);
check("réponse !ok → aucun cache écrit (planning)", lireCache(CLES.planningCours) === null);

console.log("\n== Garde-fous statiques (câblage) ==");
const here = dirname(fileURLToPath(import.meta.url));
const read = (p: string) => readFileSync(join(here, "..", p), "utf8");
const shell = read("components/admin/AdminShell.tsx");
check("AdminShell : préchargement au montage", shell.includes("prechargerOnglet(\"/admin/presence\"") && shell.includes("prechargerOnglet(\"/admin/planning\""));
check("AdminShell : préchargement au survol/appui de l'entrée", shell.includes("onMouseEnter={() => prechargerOnglet(n.href, role)}") && shell.includes("onPointerDown"));
check("AdminShell : PURGE du cache à la déconnexion", shell.includes("purgerCache()") && /logout[\s\S]*purgerCache\(\)/.test(shell));

const login = read("app/admin/login/page.tsx");
check("login : purge au montage (session invalidée/expirée)", /useEffect\(\(\) => \{\s*purgerCache\(\);/.test(login));
check("login : purge avant d'ouvrir une nouvelle session (changement de rôle)", login.includes("purgerCache();\n      setAdminSession(true)"));

const hook = read("components/admin/useDonneesAdmin.ts");
check("hook : purge sur 401/403 (invalidation serveur)", hook.includes("purgerCache()") && hook.includes("401"));
check("hook : hydrate depuis le cache", hook.includes("lireCache"));
check("hook : l'erreur remonte (jamais écrasée en vide)", hook.includes("setError"));

const cache = read("lib/admin-cache.ts");
check("admin-cache : clés préfixées par le rôle (getAdminRole)", cache.includes("getAdminRole()") && cache.includes("cleComplete"));
check("admin-cache : purgerCache supprime toutes les clés du préfixe", cache.includes("startsWith(PREFIXE)"));

const presence = read("components/admin/Presence.tsx");
check("Présence : garde le rafraîchissement auto 30 s", presence.includes("intervalMs: 30_000") || presence.includes("intervalMs: 30000"));

const planning = read("app/admin/planning/page.tsx");
check("Planning : squelette + erreur (pas de grille vide trompeuse)", planning.includes("SquelettePlanning") && planning.includes("ErreurPlanning"));

console.log(`\nRésultat : ${ok} OK / ${ko} KO`);
process.exit(ko === 0 ? 0 : 1);
