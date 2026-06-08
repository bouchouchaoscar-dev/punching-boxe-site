import { Resend } from "resend";
import { CLUB, SITE_URL, HORAIRES, SALLES } from "./constants";
import { euro, PACKAGE_LABEL, type ModePaiement, type PackageType } from "./pricing";
import { formatDateFr } from "./tarifs";
import { familleEchec } from "./stripe-erreurs";

let resend: Resend | null = null;
function getResend(): Resend | null {
  const key = process.env.RESEND_API_KEY;
  if (!key) {
    console.warn("Email non envoyé : RESEND_API_KEY manquant.");
    return null;
  }
  if (!resend) resend = new Resend(key);
  return resend;
}

// Expéditeur. Par défaut le domaine de TEST Resend (fonctionne avec n'importe
// quelle clé API, sans vérification de domaine). En production avec un domaine
// vérifié, définir RESEND_FROM="Punching Boxe <contact@punching-boxe.com>".
const FROM =
  process.env.RESEND_FROM || "Punching Boxe <onboarding@resend.dev>";
const ADMIN_TO = process.env.ADMIN_NOTIFY_EMAIL || CLUB.email;

const MODE_LABEL: Record<ModePaiement, string> = {
  stripe_1x: "Carte — 1 fois",
  stripe_2x: "Carte — 2 fois",
  stripe_3x: "Carte — 3 fois",
  stripe_4x: "Carte — 4 fois",
  especes: "Espèces (au prochain cours)",
};

export type Echeance = { numero: number; date: string; montant: number };

type MailData = {
  prenom: string;
  nom: string;
  email: string;
  type_adherent: string;
  package?: PackageType | null;
  montant_total: number;
  mode_paiement: ModePaiement;
  adherentId?: string;
  echeances?: Echeance[];
};

const packageLabel = (p?: PackageType | null) => (p ? PACKAGE_LABEL[p] : "—");

function wrap(inner: string) {
  return `<div style="font-family:Arial,Helvetica,sans-serif;max-width:560px;margin:0 auto;color:#0a0a0a">
    <div style="background:#0a0a0a;padding:24px;text-align:center">
      <span style="color:#fff;font-weight:800;text-transform:uppercase;letter-spacing:1px;font-size:18px">Punching <span style="color:#FF6B00">Boxe</span></span>
    </div>
    <div style="padding:28px 24px">${inner}</div>
    <div style="background:#fafafa;padding:18px 24px;font-size:12px;color:#666;text-align:center">
      ${CLUB.nom}<br/>${CLUB.telephone} · ${CLUB.email}<br/>${CLUB.adresse}
    </div>
  </div>`;
}

function button(href: string, label: string) {
  return `<a href="${href}" style="display:inline-block;background:#FF6B00;color:#fff;text-decoration:none;padding:12px 22px;border-radius:999px;font-weight:700;margin-top:6px">${label}</a>`;
}

function tableEcheances(echeances: Echeance[]) {
  const lignes = echeances
    .map(
      (e) =>
        `<tr>
          <td style="padding:6px 8px;border-bottom:1px solid #eee">Échéance ${e.numero}${e.numero === 1 ? " (aujourd'hui)" : ""}</td>
          <td style="padding:6px 8px;border-bottom:1px solid #eee">${formatDateFr(e.date)}</td>
          <td style="padding:6px 8px;border-bottom:1px solid #eee;text-align:right;font-weight:700">${euro(e.montant)}</td>
        </tr>`,
    )
    .join("");
  return `<table style="width:100%;border-collapse:collapse;font-size:13px;margin:8px 0">
    <thead><tr style="color:#888;text-transform:uppercase;font-size:11px">
      <th style="text-align:left;padding:4px 8px">Échéance</th>
      <th style="text-align:left;padding:4px 8px">Date</th>
      <th style="text-align:right;padding:4px 8px">Montant</th>
    </tr></thead>
    <tbody>${lignes}</tbody>
  </table>`;
}

function blocHoraires() {
  const lignes = HORAIRES.map(
    (h) =>
      `<li style="margin:2px 0"><strong>${h.jour}</strong> ${h.heure} — ${h.cours} (${h.public})</li>`,
  ).join("");
  return `<p style="margin:18px 0 6px;font-weight:700">Les horaires des cours</p>
    <ul style="margin:0;padding-left:18px;color:#444;font-size:13px;line-height:1.5">${lignes}</ul>`;
}

function blocSalles() {
  const lignes = SALLES.map(
    (s) =>
      `<li style="margin:2px 0"><strong>${s.nom}</strong> — ${s.adresse}, ${s.ville}</li>`,
  ).join("");
  return `<p style="margin:18px 0 6px;font-weight:700">Nos salles</p>
    <ul style="margin:0;padding-left:18px;color:#444;font-size:13px;line-height:1.5">${lignes}</ul>`;
}

/** 0 — Email de bienvenue à la création du compte (espace adhérent). */
export async function sendAccountWelcome(d: { email: string }) {
  const client = getResend();
  if (!client) return { skipped: true };

  const html = wrap(`
    <h1 style="font-size:22px;margin:0 0 8px">Bienvenue sur votre espace adhérent 🥊</h1>
    <p style="line-height:1.6;color:#444">Bonjour,</p>
    <p style="line-height:1.6;color:#444">Votre espace adhérent <strong>${CLUB.nom}</strong> a bien été créé.</p>
    <p style="line-height:1.6;color:#444">Vous pouvez maintenant compléter votre inscription en ligne :</p>
    <p style="margin:6px 0 18px">${button(`${SITE_URL}/inscription`, "Compléter mon inscription")}</p>
    <p style="line-height:1.6;color:#444">À bientôt à la salle !<br/>Pascal et l'équipe du Punching Boxe<br/>${CLUB.telephone} · ${CLUB.email}</p>
  `);

  return client.emails.send({
    from: FROM,
    to: d.email,
    subject: "Bienvenue sur votre espace adhérent 🥊",
    html,
  });
}

/** 1 — Email de confirmation à l'adhérent (espèces ou carte). */
export async function sendAdherentConfirmation(d: MailData) {
  const client = getResend();
  if (!client) return { skipped: true };

  const especes = d.mode_paiement === "especes";
  const fractionne = (d.echeances?.length ?? 0) > 1;

  const html = wrap(`
    <h1 style="font-size:22px;margin:0 0 8px">Bonjour ${d.prenom},</h1>
    <p style="line-height:1.6;color:#444">Votre inscription au <strong>${CLUB.nom}</strong> est confirmée.</p>
    <div style="border:1px solid #eee;border-radius:12px;padding:16px;margin:18px 0">
      <p style="margin:4px 0"><strong>Formule :</strong> ${packageLabel(d.package)}</p>
      <p style="margin:4px 0"><strong>Montant :</strong> ${euro(d.montant_total)}</p>
      <p style="margin:4px 0"><strong>Mode de paiement :</strong> ${MODE_LABEL[d.mode_paiement]}</p>
    </div>
    ${fractionne ? `<p style="line-height:1.6;color:#444"><strong>Vos échéances :</strong></p>${tableEcheances(d.echeances!)}` : ""}
    ${
      especes
        ? `<p style="line-height:1.6;color:#444">Pensez à régler auprès du professeur lors de votre prochain cours.</p>`
        : ""
    }
    <p style="line-height:1.6;color:#444">Votre dossier est en cours de validation. Connectez-vous à votre espace personnel pour suivre son avancement.</p>
    <p style="margin:6px 0 18px">${button(`${SITE_URL}/mon-espace`, "Accéder à mon espace")}</p>
    ${blocHoraires()}
    ${blocSalles()}
    <p style="margin-top:18px;font-weight:700;color:#FF6B00">À bientôt à la salle ! 🥊</p>
  `);

  return client.emails.send({
    from: FROM,
    to: d.email,
    subject: "Bienvenue au Punching Boxe 🥊",
    html,
  });
}

/** 2 — Email de notification à Pascal (nouvelle inscription). */
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
      <p style="margin:4px 0"><strong>Montant total :</strong> ${euro(d.montant_total)}</p>
      <p style="margin:4px 0"><strong>Mode de paiement :</strong> ${MODE_LABEL[d.mode_paiement]}</p>
    </div>
    ${button(lien, "Voir la fiche adhérent")}
  `);

  return client.emails.send({
    from: FROM,
    to: ADMIN_TO,
    subject: `Nouvelle inscription — ${d.prenom} ${d.nom}`,
    html,
  });
}

/** 3 — Email à l'adhérent : un document a été refusé. */
export async function sendDocumentActionRequired(d: {
  prenom: string;
  email: string;
  docLabel?: string;
  motif?: string | null;
}) {
  const client = getResend();
  if (!client) return { skipped: true };

  const html = wrap(`
    <h1 style="font-size:20px;margin:0 0 8px">Un document nécessite votre attention</h1>
    <p style="line-height:1.6;color:#444">Bonjour ${d.prenom},</p>
    <p style="line-height:1.6;color:#444">Un document de votre dossier d'inscription a été refusé.</p>
    <div style="border:1px solid #f0d4c4;background:#fff5ee;border-radius:12px;padding:14px;margin:14px 0;color:#b1480f">
      ${d.docLabel ? `<p style="margin:2px 0"><strong>Document :</strong> ${d.docLabel}</p>` : ""}
      ${d.motif ? `<p style="margin:2px 0"><strong>Motif :</strong> ${d.motif}</p>` : ""}
    </div>
    <p style="line-height:1.6;color:#444">Connectez-vous à votre espace personnel pour le remplacer.</p>
    <p style="margin:6px 0">${button(`${SITE_URL}/mon-espace`, "Accéder à mon espace")}</p>
  `);

  return client.emails.send({
    from: FROM,
    to: d.email,
    subject: "Action requise — Un document nécessite votre attention",
    html,
  });
}

/** 4 — Email à Pascal : un adhérent a (re)déposé un document. */
export async function sendAdminDocReplaced(d: {
  prenom: string;
  nom: string;
  adherentId: string;
  docLabel: string;
}) {
  const client = getResend();
  if (!client) return { skipped: true };

  const lien = `${SITE_URL}/admin/adherents/${d.adherentId}`;
  const html = wrap(`
    <h1 style="font-size:20px;margin:0 0 8px">Document mis à jour 📎</h1>
    <p style="line-height:1.6;color:#444"><strong>${d.prenom} ${d.nom}</strong> vient de déposer un document : <strong>${d.docLabel}</strong>.</p>
    <p style="line-height:1.6;color:#444">Connectez-vous au dashboard pour le vérifier et valider le dossier.</p>
    ${button(lien, "Voir la fiche adhérent")}
  `);

  return client.emails.send({
    from: FROM,
    to: ADMIN_TO,
    subject: `Document mis à jour — ${d.prenom} ${d.nom}`,
    html,
  });
}

/** 5 — Email à l'adhérent : un prélèvement a échoué. */
export async function sendPaiementEchec(d: {
  prenom: string;
  email: string;
  montant: number;
  date?: string | null;
  numero?: number | null;
  nbEcheances?: number | null;
  code?: string | null;
}) {
  const client = getResend();
  if (!client) return { skipped: true };

  const ech = d.numero ? ` (échéance n°${d.numero})` : "";
  const prevu = d.date ? ` prévu le <strong>${formatDateFr(d.date)}</strong>` : "";
  const famille = familleEchec(d.code);
  // Dernière échéance → "finaliser", sinon "reprendre".
  const verbe =
    d.numero && d.nbEcheances && d.numero >= d.nbEcheances
      ? "finaliser"
      : "reprendre";

  // Une seule maquette, 3 variantes de texte selon la cause.
  let corps: string;
  if (famille === "provision") {
    corps = `
    <p style="line-height:1.6;color:#444">Le prélèvement de <strong>${euro(d.montant)}</strong>${ech}${prevu} n'a pas pu aboutir par manque de provision.</p>
    <p style="line-height:1.6;color:#444">Réalimentez votre compte, le prélèvement sera représenté. Vous pouvez aussi régler tout de suite depuis votre espace.</p>
    <p style="margin:6px 0">${button(`${SITE_URL}/mon-espace`, "Voir mon espace")}</p>`;
  } else if (famille === "carte_morte") {
    corps = `
    <p style="line-height:1.6;color:#444">Le prélèvement de <strong>${euro(d.montant)}</strong>${ech}${prevu} n'a pas pu aboutir : votre carte n'est plus valide.</p>
    <p style="line-height:1.6;color:#444">Connectez-vous pour régulariser avec une nouvelle carte et ${verbe} votre échéancier.</p>
    <p style="margin:6px 0">${button(`${SITE_URL}/mon-espace`, "Régulariser mon paiement")}</p>`;
  } else {
    corps = `
    <p style="line-height:1.6;color:#444">Un prélèvement de <strong>${euro(d.montant)}</strong>${ech}${prevu} n'a pas pu aboutir.</p>
    <p style="line-height:1.6;color:#444">Connectez-vous à votre espace pour régulariser votre situation.</p>
    <p style="margin:6px 0">${button(`${SITE_URL}/mon-espace`, "Régulariser mon paiement")}</p>`;
  }

  const html = wrap(`
    <h1 style="font-size:20px;margin:0 0 8px">Problème avec votre paiement</h1>
    <p style="line-height:1.6;color:#444">Bonjour ${d.prenom},</p>
    ${corps}
    <p style="line-height:1.6;color:#666;font-size:13px">Une question ? Écrivez-nous à ${CLUB.email}.</p>
  `);

  return client.emails.send({
    from: FROM,
    to: d.email,
    subject: "⚠️ Problème avec votre paiement",
    html,
  });
}

const escapeHtml = (s: string) =>
  s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");

// ---- Helpers exposés pour le module Campagnes ----
export const MAIL_FROM = FROM;
export function getResendClient(): Resend | null {
  return getResend();
}
/** Rend le contenu texte d'une campagne dans le gabarit HTML du club. */
export function renderCampagne(contenu: string): string {
  return wrap(
    `<div style="line-height:1.6;color:#222;white-space:pre-wrap">${escapeHtml(contenu)}</div>`,
  );
}

/** Formulaire de contact → email à Pascal (avec reply-to vers l'expéditeur). */
export async function sendContactMessage(d: {
  nom: string;
  email: string;
  telephone?: string;
  message: string;
}) {
  const client = getResend();
  if (!client) return { skipped: true };

  const html = wrap(`
    <h1 style="font-size:20px;margin:0 0 8px">Nouveau message de contact</h1>
    <div style="border:1px solid #eee;border-radius:12px;padding:16px;margin:14px 0">
      <p style="margin:4px 0"><strong>Nom :</strong> ${escapeHtml(d.nom)}</p>
      <p style="margin:4px 0"><strong>Email :</strong> ${escapeHtml(d.email)}</p>
      <p style="margin:4px 0"><strong>Téléphone :</strong> ${escapeHtml(d.telephone || "—")}</p>
      <p style="margin:10px 0 4px"><strong>Message :</strong></p>
      <p style="margin:4px 0;line-height:1.6;color:#444">${escapeHtml(d.message).replace(/\n/g, "<br>")}</p>
    </div>
  `);

  return client.emails.send({
    from: FROM,
    to: ADMIN_TO,
    replyTo: d.email,
    subject: `Nouveau message de contact — ${d.nom}`,
    html,
  });
}

/** Accusé de réception au visiteur ayant rempli le formulaire de contact. */
export async function sendContactConfirmation(d: { nom: string; email: string }) {
  const client = getResend();
  if (!client) return { skipped: true };

  const html = wrap(`
    <h1 style="font-size:20px;margin:0 0 8px">Message bien reçu</h1>
    <p style="line-height:1.6;color:#444">Bonjour ${escapeHtml(d.nom)},</p>
    <p style="line-height:1.6;color:#444">Nous avons bien reçu votre message et vous répondrons dans les plus brefs délais.</p>
    <p style="line-height:1.6;color:#666;font-size:13px;margin-top:16px">L'équipe du ${CLUB.nom}</p>
  `);

  return client.emails.send({
    from: FROM,
    to: d.email,
    subject: "Nous avons bien reçu votre message",
    html,
  });
}
