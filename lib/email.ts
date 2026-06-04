import { Resend } from "resend";
import { CLUB, SITE_URL } from "./constants";
import { euro, PACKAGE_LABEL, type ModePaiement, type PackageType } from "./pricing";

let resend: Resend | null = null;
function getResend(): Resend | null {
  const key = process.env.RESEND_API_KEY;
  if (!key) return null;
  if (!resend) resend = new Resend(key);
  return resend;
}

const FROM =
  process.env.RESEND_FROM || `${CLUB.nom} <contact@punching-boxe.com>`;
const ADMIN_TO = process.env.ADMIN_NOTIFY_EMAIL || CLUB.email;

const MODE_LABEL: Record<ModePaiement, string> = {
  stripe_1x: "Carte — 1 fois",
  stripe_2x: "Carte — 2 fois",
  stripe_3x: "Carte — 3 fois",
  stripe_4x: "Carte — 4 fois",
  especes: "Espèces (au prochain cours)",
};

type MailData = {
  prenom: string;
  nom: string;
  email: string;
  type_adherent: string;
  package?: PackageType | null;
  montant_total: number;
  mode_paiement: ModePaiement;
  adherentId?: string;
};

const packageLabel = (p?: PackageType | null) =>
  p ? PACKAGE_LABEL[p] : "—";

function wrap(inner: string) {
  return `<div style="font-family:Arial,Helvetica,sans-serif;max-width:560px;margin:0 auto;color:#0a0a0a">
    <div style="background:#0a0a0a;padding:24px;text-align:center">
      <span style="color:#fff;font-weight:800;text-transform:uppercase;letter-spacing:1px;font-size:18px">Punching <span style="color:#FF6B00">Boxe</span></span>
    </div>
    <div style="padding:28px 24px">${inner}</div>
    <div style="background:#fafafa;padding:18px 24px;font-size:12px;color:#666;text-align:center">
      ${CLUB.nom}<br/>${CLUB.telephone} · ${CLUB.email}
    </div>
  </div>`;
}

/** Email de confirmation à l'adhérent. */
export async function sendAdherentConfirmation(d: MailData) {
  const client = getResend();
  if (!client) return { skipped: true };

  const html = wrap(`
    <h1 style="font-size:22px;margin:0 0 8px">Bienvenue ${d.prenom} !</h1>
    <p style="line-height:1.6;color:#444">Votre inscription au <strong>${CLUB.nom}</strong> pour la saison ${CLUB.saison} a bien été enregistrée.</p>
    <div style="border:1px solid #eee;border-radius:12px;padding:16px;margin:18px 0">
      <p style="margin:4px 0"><strong>Formule :</strong> ${packageLabel(d.package)}</p>
      <p style="margin:4px 0"><strong>Type :</strong> ${d.type_adherent}</p>
      <p style="margin:4px 0"><strong>Montant :</strong> ${euro(d.montant_total)}</p>
      <p style="margin:4px 0"><strong>Règlement :</strong> ${MODE_LABEL[d.mode_paiement]}</p>
    </div>
    ${
      d.mode_paiement === "especes"
        ? `<p style="line-height:1.6;color:#444">Pensez à régler en espèces auprès du professeur lors de votre prochain cours.</p>`
        : `<p style="line-height:1.6;color:#444">Votre paiement par carte a bien été pris en compte.</p>`
    }
    <p style="line-height:1.6;color:#444"><strong>Infos pratiques</strong><br/>Adresse principale : ${CLUB.adresse}<br/>Pensez à apporter une tenue de sport. Les gants peuvent être prêtés.</p>
    <p style="margin-top:18px;font-weight:700;color:#FF6B00">À bientôt sur les tatamis ! 🥊</p>
  `);

  return client.emails.send({
    from: FROM,
    to: d.email,
    subject: `Confirmation d'inscription — ${CLUB.nomCourt}`,
    html,
  });
}

/** Email de notification à Pascal (admin). */
export async function sendAdminNotification(d: MailData) {
  const client = getResend();
  if (!client) return { skipped: true };

  const lien = d.adherentId
    ? `${SITE_URL}/admin/adherents/${d.adherentId}`
    : `${SITE_URL}/admin/adherents`;

  const html = wrap(`
    <h1 style="font-size:20px;margin:0 0 8px">Nouvelle inscription 🥊</h1>
    <div style="border:1px solid #eee;border-radius:12px;padding:16px;margin:14px 0">
      <p style="margin:4px 0"><strong>${d.prenom} ${d.nom}</strong></p>
      <p style="margin:4px 0">${d.email}</p>
      <p style="margin:4px 0"><strong>Formule :</strong> ${packageLabel(d.package)}</p>
      <p style="margin:4px 0"><strong>Type :</strong> ${d.type_adherent}</p>
      <p style="margin:4px 0"><strong>Montant :</strong> ${euro(d.montant_total)}</p>
      <p style="margin:4px 0"><strong>Règlement :</strong> ${MODE_LABEL[d.mode_paiement]}</p>
    </div>
    <a href="${lien}" style="display:inline-block;background:#FF6B00;color:#fff;text-decoration:none;padding:12px 20px;border-radius:999px;font-weight:700">Voir la fiche adhérent</a>
  `);

  return client.emails.send({
    from: FROM,
    to: ADMIN_TO,
    subject: `Nouvelle inscription : ${d.prenom} ${d.nom}`,
    html,
  });
}
