import { NextResponse } from "next/server";
import { ADMIN_USERNAME, ADMIN_PASSWORD_FALLBACK } from "@/lib/admin-auth";

export const runtime = "nodejs";

export async function POST(request: Request) {
  let body: { username?: string; password?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Corps invalide." }, { status: 400 });
  }

  const password = process.env.ADMIN_PASSWORD || ADMIN_PASSWORD_FALLBACK;
  // Identifiant = simple username (insensible à la casse), pas un email.
  const username = (body.username || "").trim();

  const ok =
    username.toLowerCase() === ADMIN_USERNAME.toLowerCase() &&
    body.password === password;

  if (!ok) {
    return NextResponse.json(
      { error: "Identifiant ou mot de passe incorrect." },
      { status: 401 },
    );
  }
  return NextResponse.json({ ok: true });
}
