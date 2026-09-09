import { NextResponse } from "next/server";
import { ADMIN_USERNAME, COACH_USERNAME } from "@/lib/admin-auth";
import type { Role } from "@/lib/admin-guard";

export const runtime = "nodejs";

export async function POST(request: Request) {
  let body: { username?: string; password?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Corps invalide." }, { status: 400 });
  }

  // FAIL CLOSED : sans les variables d'env correspondantes, aucun accès.
  // Jamais de mot de passe / identifiant par défaut en dur.
  const adminPw = process.env.ADMIN_PASSWORD;
  const coachPw = process.env.COACH_PASSWORD;
  // Identifiant = simple username (insensible à la casse), pas un email.
  const username = (body.username || "").trim().toLowerCase();
  const password = body.password || "";

  let role: Role | null = null;
  if (
    adminPw &&
    ADMIN_USERNAME &&
    username === ADMIN_USERNAME.toLowerCase() &&
    password === adminPw
  ) {
    role = "admin";
  } else if (
    coachPw &&
    COACH_USERNAME &&
    username === COACH_USERNAME.toLowerCase() &&
    password === coachPw
  ) {
    role = "coach";
  }

  if (!role) {
    return NextResponse.json(
      { error: "Identifiant ou mot de passe incorrect." },
      { status: 401 },
    );
  }
  return NextResponse.json({ ok: true, role });
}
