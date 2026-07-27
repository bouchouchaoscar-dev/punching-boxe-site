import { NextResponse } from "next/server";
import { ADMIN_USERNAME } from "@/lib/admin-auth";

export const runtime = "nodejs";

export async function POST(request: Request) {
  let body: { username?: string; password?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Corps invalide." }, { status: 400 });
  }

  // FAIL CLOSED : sans ADMIN_PASSWORD et NEXT_PUBLIC_ADMIN_USERNAME configurés
  // (variables d'env), aucun accès. Jamais de mot de passe / identifiant par défaut.
  const expected = process.env.ADMIN_PASSWORD;
  // Identifiant = simple username (insensible à la casse), pas un email.
  const username = (body.username || "").trim();

  const ok =
    !!expected &&
    !!ADMIN_USERNAME &&
    username.toLowerCase() === ADMIN_USERNAME.toLowerCase() &&
    body.password === expected;

  if (!ok) {
    return NextResponse.json(
      { error: "Identifiant ou mot de passe incorrect." },
      { status: 401 },
    );
  }
  return NextResponse.json({ ok: true });
}
