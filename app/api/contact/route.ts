import { NextResponse } from "next/server";
import { sendContactMessage, sendContactConfirmation } from "@/lib/email";

export const runtime = "nodejs";

// Anti-bot : durée minimale de remplissage attendue d'un humain (time-trap).
// En dessous, la soumission est considérée automatisée. Ajustable ici.
const MIN_FILL_TIME_MS = 3000;

export async function POST(request: Request) {
  let body: {
    nom?: string;
    email?: string;
    telephone?: string;
    message?: string;
    // Champs anti-bot (invisibles pour l'humain).
    website?: string; // honeypot : rempli uniquement par les bots
    formLoadedAt?: number; // horodatage de montage du formulaire (time-trap)
  };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Corps invalide." }, { status: 400 });
  }

  // ---------- Anti-bot (double couche, CÔTÉ SERVEUR) ----------
  // Exécuté AVANT tout envoi Resend / toute écriture. En cas de détection, on
  // renvoie un faux succès 200 (aucun effet de bord) pour ne pas signaler au
  // bot qu'il a été repéré ; l'humain ne voit aucune différence.
  const website = (body.website || "").trim();
  const formLoadedAt = body.formLoadedAt;

  // 1) Honeypot rempli => bot.
  if (website !== "") {
    return NextResponse.json({ ok: true });
  }
  // 2) Soumission trop rapide (ou horodatage absent/invalide) => bot.
  const elapsed = Date.now() - Number(formLoadedAt);
  if (!formLoadedAt || Number.isNaN(elapsed) || elapsed < MIN_FILL_TIME_MS) {
    return NextResponse.json({ ok: true });
  }
  // ------------------------------------------------------------

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
