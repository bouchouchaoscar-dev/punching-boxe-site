import { NextResponse } from "next/server";
import { sendContactMessage, sendContactConfirmation } from "@/lib/email";

export const runtime = "nodejs";

export async function POST(request: Request) {
  let body: {
    nom?: string;
    email?: string;
    telephone?: string;
    message?: string;
  };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Corps invalide." }, { status: 400 });
  }

  const nom = (body.nom || "").trim();
  const email = (body.email || "").trim();
  const telephone = (body.telephone || "").trim();
  const message = (body.message || "").trim();

  if (!nom || !email || !message) {
    return NextResponse.json(
      { error: "Nom, email et message sont requis." },
      { status: 400 },
    );
  }
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
    return NextResponse.json({ error: "Email invalide." }, { status: 400 });
  }

  try {
    await Promise.all([
      sendContactMessage({ nom, email, telephone, message }),
      sendContactConfirmation({ nom, email }),
    ]);
  } catch (e) {
    console.error("Contact email error:", e);
    return NextResponse.json(
      { error: "L'envoi a échoué. Réessayez plus tard." },
      { status: 500 },
    );
  }

  return NextResponse.json({ ok: true });
}
