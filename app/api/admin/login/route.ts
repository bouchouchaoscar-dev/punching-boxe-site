import { NextResponse } from "next/server";
import { ADMIN_EMAIL, ADMIN_PASSWORD_FALLBACK } from "@/lib/admin-auth";

export const runtime = "nodejs";

export async function POST(request: Request) {
  let body: { email?: string; password?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Corps invalide." }, { status: 400 });
  }

  const password = process.env.ADMIN_PASSWORD || ADMIN_PASSWORD_FALLBACK;
  const email = (body.email || "").trim().toLowerCase();

  const ok =
    email === ADMIN_EMAIL.toLowerCase() && body.password === password;

  if (!ok) {
    return NextResponse.json(
      { error: "Email ou mot de passe incorrect." },
      { status: 401 },
    );
  }
  return NextResponse.json({ ok: true });
}
