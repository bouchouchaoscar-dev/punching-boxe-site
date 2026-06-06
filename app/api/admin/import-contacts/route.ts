import { NextResponse } from "next/server";
import { getSupabaseAdmin, isSupabaseConfigured } from "@/lib/supabase";
import { isAdminRequest } from "@/lib/admin-guard";

export const runtime = "nodejs";

const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

/** Découpe une ligne CSV en champs (gère les guillemets simples). */
function parseLine(line: string, delim: string): string[] {
  const out: string[] = [];
  let cur = "";
  let inQ = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (c === '"') {
      if (inQ && line[i + 1] === '"') {
        cur += '"';
        i++;
      } else inQ = !inQ;
    } else if (c === delim && !inQ) {
      out.push(cur);
      cur = "";
    } else cur += c;
  }
  out.push(cur);
  return out.map((s) => s.trim());
}

type ParsedContact = {
  nom: string | null;
  prenom: string | null;
  email: string;
  telephone: string | null;
};

/** Parse un CSV en contacts (colonnes nom, prenom, email, telephone). */
function parseCsv(csv: string): ParsedContact[] {
  const lines = csv
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);
  if (lines.length === 0) return [];

  const delim = (lines[0].match(/;/g) || []).length >
    (lines[0].match(/,/g) || []).length
    ? ";"
    : ",";

  const first = parseLine(lines[0], delim).map((s) => s.toLowerCase());
  const hasHeader = first.some((c) => c.includes("email") || c.includes("mail"));

  let idx = { nom: 0, prenom: 1, email: 2, telephone: 3 };
  let start = 0;
  if (hasHeader) {
    const find = (...names: string[]) =>
      first.findIndex((c) => names.some((n) => c.includes(n)));
    idx = {
      nom: find("nom"),
      prenom: find("prenom", "prénom", "firstname"),
      email: find("email", "mail"),
      telephone: find("tel", "phone", "téléphone"),
    };
    // Si "nom" matche aussi "prenom", on garde l'ordre.
    if (idx.email < 0) idx.email = 2;
    start = 1;
  }

  const out: ParsedContact[] = [];
  for (let i = start; i < lines.length; i++) {
    const f = parseLine(lines[i], delim);
    const email = (f[idx.email] || "").toLowerCase();
    if (!EMAIL_RE.test(email)) continue;
    out.push({
      nom: idx.nom >= 0 ? f[idx.nom] || null : null,
      prenom: idx.prenom >= 0 ? f[idx.prenom] || null : null,
      email,
      telephone: idx.telephone >= 0 ? f[idx.telephone] || null : null,
    });
  }
  return out;
}

export async function POST(request: Request) {
  if (!isAdminRequest(request)) {
    return NextResponse.json({ error: "Non autorisé." }, { status: 401 });
  }
  if (!isSupabaseConfigured()) {
    return NextResponse.json({ error: "Supabase non configuré." }, { status: 503 });
  }

  let body: { csv?: string; preview?: boolean };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Corps invalide." }, { status: 400 });
  }

  const contacts = parseCsv(body.csv || "");
  if (contacts.length === 0) {
    return NextResponse.json(
      { error: "Aucun contact valide (vérifiez la colonne email)." },
      { status: 400 },
    );
  }

  // Dédup par email dans le fichier lui-même.
  const uniq = [...new Map(contacts.map((c) => [c.email, c])).values()];

  if (body.preview) {
    return NextResponse.json({ preview: uniq.slice(0, 10), total: uniq.length });
  }

  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from("contacts_mailing")
    .upsert(
      uniq.map((c) => ({ ...c, source: "import" })),
      { onConflict: "email", ignoreDuplicates: true },
    )
    .select("id");
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const imported = data?.length ?? 0;
  return NextResponse.json({ imported, skipped: uniq.length - imported });
}
