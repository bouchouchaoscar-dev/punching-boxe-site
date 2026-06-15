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

const count = async (table: string, filter?: (q: any) => any) => {
  let q = sb.from(table).select("*", { count: "exact", head: true });
  if (filter) q = filter(q);
  const { count: c, error } = await q;
  return error ? `ERR(${error.message})` : (c ?? 0);
};

console.log("───────── À SUPPRIMER / RÉINITIALISER ─────────");
console.log("adherents (natifs)        :", await count("adherents"));
console.log("  dont ancien_id rempli   :", await count("adherents", (q) => q.not("ancien_id", "is", null)), "(migrations à annuler)");
console.log("paiements                 :", await count("paiements"));
console.log("remboursements            :", await count("remboursements"));
console.log("profiles (comptes liés)   :", await count("profiles"));
console.log("campagnes / envois        :", await count("campagnes"));
console.log("contacts_mailing (import) :", await count("contacts_mailing"));
console.log("desinscriptions_mailing   :", await count("desinscriptions_mailing"));
console.log("admin_users (table, ≠auth):", await count("admin_users"));

// Comptes Auth
let authTotal = 0;
let page = 1;
for (;;) {
  const { data, error } = await sb.auth.admin.listUsers({ page, perPage: 1000 });
  if (error) { console.log("auth.users               : ERR", error.message); break; }
  authTotal += data.users.length;
  if (data.users.length < 1000) break;
  page++;
}
console.log("auth.users (comptes)      :", authTotal);

// Stockage
const bucket = "adherents-documents";
const { data: folders, error: stErr } = await sb.storage.from(bucket).list("", { limit: 10000 });
if (stErr) {
  console.log("storage", bucket, ": ERR", stErr.message);
} else {
  let files = 0;
  for (const f of folders ?? []) {
    // chaque dossier = un adherentId ; on compte ses fichiers
    if (f.id === null || f.metadata == null) {
      const { data: sub } = await sb.storage.from(bucket).list(f.name, { limit: 10000 });
      files += (sub ?? []).filter((x) => x.id !== null).length;
    } else {
      files += 1;
    }
  }
  console.log(`storage ${bucket}        : ${folders?.length ?? 0} dossiers, ${files} fichiers`);
}

console.log("\n───────── À GARDER INTACT ─────────");
console.log("anciens_adherents         :", await count("anciens_adherents"), "(attendu 858)");
console.log("historique_saisons        :", await count("historique_saisons"), "(attendu 1245)");
console.log("templates_mail            :", await count("templates_mail"), "(attendu 12)");
