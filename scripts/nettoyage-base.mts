import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";
for (const line of readFileSync(".env.local", "utf8").split("\n")) {
  const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
}
const sb = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

const delAll = async (table: string, idCol = "id") => {
  const { error, count } = await sb
    .from(table)
    .delete({ count: "exact" })
    .not(idCol, "is", null);
  console.log(`  ${table.padEnd(26)} → ${error ? "ERR " + error.message : `${count ?? 0} supprimé(s)`}`);
};

// ───────── 1. STORAGE ─────────
console.log("1) Storage adherents-documents");
const bucket = "adherents-documents";
const { data: roots } = await sb.storage.from(bucket).list("", { limit: 10000 });
const paths: string[] = [];
for (const e of roots ?? []) {
  if (e.id === null) {
    // dossier (= adherentId) → ses fichiers
    const { data: sub } = await sb.storage.from(bucket).list(e.name, { limit: 10000 });
    for (const f of sub ?? []) if (f.id !== null) paths.push(`${e.name}/${f.name}`);
  } else {
    paths.push(e.name); // fichier en racine (improbable)
  }
}
if (paths.length) {
  const { error } = await sb.storage.from(bucket).remove(paths);
  console.log(`  ${paths.length} fichier(s) → ${error ? "ERR " + error.message : "supprimé(s)"}`);
} else {
  console.log("  (aucun fichier)");
}

// ───────── 2. TABLES (enfants → parents) ─────────
console.log("2) Tables");
await delAll("remboursements");
await delAll("paiements");
await delAll("profiles");
await delAll("adherents");
await delAll("campagnes");

// ───────── 3. AUTH ─────────
console.log("3) Comptes Auth");
let page = 1, supprimes = 0;
for (;;) {
  const { data, error } = await sb.auth.admin.listUsers({ page, perPage: 1000 });
  if (error) { console.log("  listUsers ERR", error.message); break; }
  if (!data.users.length) break;
  for (const u of data.users) {
    const { error: e } = await sb.auth.admin.deleteUser(u.id);
    if (e) console.log("  deleteUser ERR", e.message);
    else supprimes++;
  }
  if (data.users.length < 1000) break;
}
console.log(`  auth.users → ${supprimes} supprimé(s)`);

console.log("\n✔ Nettoyage terminé.");
