import { NextResponse } from "next/server";
import { sendAccountWelcome } from "@/lib/email";

export const runtime = "nodejs";

// POST — email de bienvenue après création d'un compte (espace adhérent).
export async function POST(request: Request) {
  let body: { email?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Corps invalide." }, { status: 400 });
  }
  const email = (body.email || "").trim();
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
    return NextResponse.json({ error: "Email invalide." }, { status: 400 });
  }

  try {
    await sendAccountWelcome({ email });
  } catch (e) {
    console.error("Email bienvenue:", e);
    // best-effort : on n'échoue pas la création de compte pour un email.
  }
  return NextResponse.json({ ok: true });
}
