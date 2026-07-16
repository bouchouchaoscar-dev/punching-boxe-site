import { Resend } from "resend";
import { CLUB, SITE_URL, HORAIRES, SALLES } from "./constants";
import { unsubscribeUrl } from "./unsubscribe";
import { euro, formuleLabel, type ModePaiement, type PackageType } from "./pricing";
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
// vérifié, définir RESEND_FROM="<Nom du club> <contact@domaine>".
const FROM =
  process.env.RESEND_FROM || `${CLUB.nomCourt} <onboarding@resend.dev>`;
const ADMIN_TO = process.env.ADMIN_NOTIFY_EMAIL || CLUB.email;
// Reply-To des mails ADHÉRENTS : une réponse de l'adhérent arrive dans la boîte
// du club (consultée par l'admin). From = club, Reply-To = même adresse club.
const REPLY_TO = CLUB.email;

// Orange EXACT du logo (échantillonné sur public/logo/logo.png), pour que le
// "BOXE" du bandeau et les CTA matchent parfaitement le logo rond. Une seule
// teinte d'orange dans tout l'email.
const ORANGE = "#F84800";

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
  option_prepa_physique?: boolean;
  montant_total: number;
  mode_paiement: ModePaiement;
  adherentId?: string;
  echeances?: Echeance[];
};

function wrap(inner: string) {
  return `<div style="font-family:Arial,Helvetica,sans-serif;max-width:560px;margin:0 auto;color:#0a0a0a">
    <div style="background:#0a0a0a;padding:22px 24px;text-align:center">
      <img src="${SITE_URL}/logo/logo.png" alt="${CLUB.nomCourt}" width="56" height="56" style="display:block;margin:0 auto 10px;width:56px;height:56px;border-radius:9999px;object-fit:cover" />
      <span style="color:#fff;font-weight:800;text-transform:uppercase;letter-spacing:1px;font-size:18px">${CLUB.wordmark.avant} <span style="color:${ORANGE}">${CLUB.wordmark.accent}</span></span>
    </div>
    <div style="padding:28px 24px">${inner}</div>
    <div style="background:#fafafa;padding:18px 24px;font-size:12px;color:#666;text-align:center">
      ${CLUB.nom}<br/>${CLUB.telephone} · ${CLUB.email}<br/>${CLUB.adresse}
    </div>
  </div>`;
}

function button(href: string, label: string) {
  return `<a href="${href}" style="display:inline-block;background:${ORANGE};color:#fff;text-decoration:none;padding:12px 22px;border-radius:999px;font-weight:700;margin-top:6px">${label}</a>`;
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
    replyTo: REPLY_TO,
    subject: "Bienvenue sur votre espace adhérent 🥊",
    html,
  });
}

/** 0 bis — Relance « panier abandonné » : dossier carte créé mais paiement
 *  jamais finalisé (24h+). Lien direct vers la reprise du paiement. Envoyé une
 *  seule fois (flag relance_panier_envoyee_at géré par l'appelant). */
export async function sendRelancePanier(d: {
  prenom: string;
  email: string;
  adherentId: string;
}) {
  const client = getResend();
  if (!client) return { skipped: true };

  const html = wrap(`
    <h1 style="font-size:22px;margin:0 0 8px">Finalisez votre inscription 🥊</h1>
    <p style="line-height:1.6;color:#444">Bonjour ${d.prenom},</p>
    <p style="line-height:1.6;color:#444">Votre inscription au <strong>${CLUB.nom}</strong> a bien été commencée, mais votre paiement n'a pas été finalisé. Votre place n'est donc pas encore confirmée.</p>
    <p style="line-height:1.6;color:#444">Il ne reste qu'une étape : régler en ligne en quelques secondes (carte ou paiement en plusieurs fois).</p>
    <p style="margin:6px 0 18px">${button(`${SITE_URL}/inscription/finaliser/${d.adherentId}`, "Finaliser mon paiement")}</p>
    <p style="line-height:1.6;color:#666;font-size:13px">Vous pouvez aussi régler en espèces auprès du professeur lors de votre prochain cours. Une question ? Écrivez-nous à ${CLUB.email}.</p>
  `);

  return client.emails.send({
    from: FROM,
    to: d.email,
    replyTo: REPLY_TO,
    subject: "Finalisez votre inscription au Punching Boxe 🥊",
    html,
  });
}

/** 0 ter — Relance « compte sans inscription » : espace créé mais aucun dossier
 *  démarré (24h+). Envoyé une seule fois (table relances_compte gère le flag). */
export async function sendCommencerInscription(d: {
  prenom: string;
  email: string;
}) {
  const client = getResend();
  if (!client) return { skipped: true };

  const salut = d.prenom?.trim() ? `Bonjour ${d.prenom.trim()},` : "Bonjour,";
  const html = wrap(`
    <h1 style="font-size:22px;margin:0 0 8px">Votre espace est prêt 🥊</h1>
    <p style="line-height:1.6;color:#444">${salut}</p>
    <p style="line-height:1.6;color:#444">Votre espace adhérent est créé, il ne reste plus qu'à démarrer votre inscription ! Cela prend moins de 5 minutes, tout se fait en ligne.</p>
    <p style="margin:6px 0 18px">${button(`${SITE_URL}/inscription`, "Commencer mon inscription")}</p>
    <p style="line-height:1.6;color:#666;font-size:13px">Une question ? Écrivez-nous à ${CLUB.email}.</p>
  `);

  return client.emails.send({
    from: FROM,
    to: d.email,
    replyTo: REPLY_TO,
    subject: "🥊 Votre espace est prêt — plus qu'une étape !",
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
      <p style="margin:4px 0"><strong>Formule :</strong> ${formuleLabel(d.package, d.option_prepa_physique)}</p>
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
    <p style="margin-top:18px;font-weight:700;color:${ORANGE}">À bientôt à la salle ! 🥊</p>
  `);

  return client.emails.send({
    from: FROM,
    to: d.email,
    replyTo: REPLY_TO,
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
      <p style="margin:4px 0"><strong>Formule :</strong> ${formuleLabel(d.package, d.option_prepa_physique)}</p>
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
    <p style="line-height:1.6;color:#444">Merci de le redéposer au plus vite depuis votre espace personnel pour que nous puissions valider votre dossier.</p>
    <p style="margin:6px 0">${button(`${SITE_URL}/mon-espace`, "Régulariser mon dossier")}</p>
  `);

  return client.emails.send({
    from: FROM,
    to: d.email,
    replyTo: REPLY_TO,
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
    replyTo: REPLY_TO,
    subject: "⚠️ Problème avec votre paiement",
    html,
  });
}

export type RemboursementContexte = {
  montant: number;
  canal: "stripe" | "especes" | "virement";
  total: boolean; // true = tout le remboursable a été remboursé
  ferme: boolean; // true = fin d'inscription
  echeancesFutures: number; // nb d'échéances futures qui existaient (0 si 1 fois)
};

/** Matrice ADAPTATIVE du mail de remboursement : ne mentionne QUE ce qui
 *  s'applique réellement (canal réel, total/partiel, fermeture ou non,
 *  prélèvements à venir uniquement s'il existait des échéances futures).
 *  Fonction PURE (testable) → renvoie sujet + lignes du corps. */
export function messageRemboursement(d: RemboursementContexte): {
  subject: string;
  ligneMontant: string;
  ligneSituation: string;
} {
  const moyen =
    d.canal === "especes"
      ? "en espèces"
      : d.canal === "virement"
        ? "par virement"
        : "sur votre carte bancaire";

  // Ligne montant : total vs partiel.
  const ligneMontant = d.total
    ? `Vous avez été remboursé de l'intégralité de votre paiement, soit <strong>${euro(d.montant)}</strong>, ${moyen}.`
    : `Vous avez été remboursé de <strong>${euro(d.montant)}</strong> ${moyen}.`;

  // Ligne situation : combine fermeture × prélèvements futurs RÉELS.
  const aDesEcheances = d.echeancesFutures > 0;
  let ligneSituation = "";
  if (d.ferme) {
    ligneSituation = aDesEcheances
      ? "Vos prélèvements à venir sont arrêtés et votre inscription prend fin."
      : "Votre inscription prend fin.";
  } else if (aDesEcheances) {
    // Cas qui marche déjà : fractionné partiel sans fermeture.
    ligneSituation =
      "Vos prélèvements se poursuivent normalement aux dates prévues.";
  }
  // (!ferme && pas d'échéances → aucune ligne situation : rien à dire.)

  return {
    subject: d.ferme
      ? "Remboursement et fin de votre inscription"
      : "Confirmation de votre remboursement",
    ligneMontant,
    ligneSituation,
  };
}

/** 6 — Email à l'adhérent : remboursement effectué. Le montant est le montant
 *  RÉELLEMENT remboursé. Wording via la matrice pure messageRemboursement. */
export async function sendRemboursement(
  d: RemboursementContexte & { prenom: string; email: string },
) {
  const client = getResend();
  if (!client) return { skipped: true };

  const { subject, ligneMontant, ligneSituation } = messageRemboursement(d);

  const html = wrap(`
    <h1 style="font-size:20px;margin:0 0 8px">Confirmation de remboursement</h1>
    <p style="line-height:1.6;color:#444">Bonjour ${d.prenom},</p>
    <p style="line-height:1.6;color:#444">${ligneMontant}</p>
    ${ligneSituation ? `<p style="line-height:1.6;color:#444">${ligneSituation}</p>` : ""}
    <p style="margin:6px 0">${button(`${SITE_URL}/mon-espace`, "Voir mon dossier")}</p>
    <p style="line-height:1.6;color:#666;font-size:13px">Une question ? Écrivez-nous à ${CLUB.email}.</p>
  `);

  return client.emails.send({ from: FROM, to: d.email, replyTo: REPLY_TO, subject, html });
}

/** 6 bis — Email à l'adhérent : dossier ENTIÈREMENT validé (paiement engagé +
 *  4 documents validés). Envoyé UNE SEULE FOIS (flag mail_dossier_complet_envoye
 *  géré par l'appelant). Ton positif. */
export async function sendDossierComplet(d: { prenom: string; email: string }) {
  const client = getResend();
  if (!client) return { skipped: true };

  const html = wrap(`
    <h1 style="font-size:20px;margin:0 0 8px">Votre dossier est complet ✅</h1>
    <p style="line-height:1.6;color:#444">Bonjour ${d.prenom},</p>
    <p style="line-height:1.6;color:#444">Votre dossier d'inscription est complet et validé. Tout est en ordre, vous êtes prêt(e) pour la saison. À bientôt à la salle !</p>
    <p style="margin:6px 0">${button(`${SITE_URL}/mon-espace`, "Voir mon dossier")}</p>
    <p style="line-height:1.6;color:#666;font-size:13px">Une question ? Écrivez-nous à ${CLUB.email}.</p>
  `);

  return client.emails.send({
    from: FROM,
    to: d.email,
    replyTo: REPLY_TO,
    subject: "Votre dossier d'inscription est validé",
    html,
  });
}

/** 7 — Email à l'adhérent : fin d'inscription SANS remboursement (clôture). */
export async function sendFinInscription(d: {
  prenom: string;
  email: string;
  date?: string | null;
}) {
  const client = getResend();
  if (!client) return { skipped: true };

  const quand = d.date
    ? ` à la date du <strong>${formatDateFr(d.date.slice(0, 10))}</strong>`
    : "";
  const html = wrap(`
    <h1 style="font-size:20px;margin:0 0 8px">Votre inscription a pris fin</h1>
    <p style="line-height:1.6;color:#444">Bonjour ${d.prenom},</p>
    <p style="line-height:1.6;color:#444">Votre adhésion au <strong>${CLUB.nom}</strong> a été clôturée${quand}. Vos éventuels prélèvements à venir sont arrêtés.</p>
    <p style="line-height:1.6;color:#444">Vous restez le bienvenu si vous souhaitez revenir : il suffira de vous réinscrire en ligne.</p>
    <p style="margin:6px 0">${button(`${SITE_URL}/inscription`, "Me réinscrire")}</p>
    <p style="line-height:1.6;color:#666;font-size:13px">Une question ? Écrivez-nous à ${CLUB.email}.</p>
  `);

  return client.emails.send({
    from: FROM,
    to: d.email,
    replyTo: REPLY_TO,
    subject: "Clôture de votre inscription",
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
/**
 * Rend le contenu texte d'une CAMPAGNE (marketing) dans le gabarit du club.
 * Si `email` est fourni, ajoute un pied de page avec le lien de désinscription
 * (RGPD). Les mails TRANSACTIONNELS utilisent `wrap()` directement → pas de lien.
 */
export function renderCampagne(contenu: string, email?: string): string {
  // Le contenu est échappé (sécurité), puis les jetons de bouton sont remplacés
  // par de vrais CTA orange cliquables (style identique aux transactionnels).
  const corpsTexte = escapeHtml(contenu)
    .replace(
      /\{\{bouton_inscription\}\}/g,
      button(`${SITE_URL}/inscription`, "S'inscrire maintenant"),
    )
    .replace(
      /\{\{bouton_espace\}\}/g,
      button(`${SITE_URL}/mon-espace`, "Accéder à mon espace"),
    )
    .replace(
      /\{\{bouton_finaliser\}\}/g,
      button(`${SITE_URL}/mon-espace`, "Finaliser mon inscription"),
    );
  const corps = `<div style="line-height:1.6;color:#222;white-space:pre-wrap">${corpsTexte}</div>`;
  const pied = email
    ? `<div style="margin-top:22px;padding-top:14px;border-top:1px solid #eee;font-size:12px;color:#999;line-height:1.5">
        Vous recevez cet email en tant que membre du Punching Boxe.<br/>
        <a href="${unsubscribeUrl(email)}" style="color:#999;text-decoration:underline">Se désinscrire des communications</a>
       </div>`
    : "";
  return wrap(corps + pied);
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
    replyTo: REPLY_TO,
    subject: "Nous avons bien reçu votre message",
    html,
  });
}
