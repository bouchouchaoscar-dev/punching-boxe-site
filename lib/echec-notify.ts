import type { SupabaseClient } from "@supabase/supabase-js";
import { sendPaiementEchec, sendAdminEchecPaiement } from "@/lib/email";

// Notification d'un ÉCHEC de prélèvement d'échéance, en CLAIM-THEN-SEND (même
// patron que mail_inscription_envoye) : chaque mail n'est envoyé QUE si son flag
// idempotent passe false→true de façon atomique. Empêche le double envoi quand
// l'échec est posé par DEUX chemins (catch du cron + webhook payment_failed).
//
// RÉSILIENT : si les colonnes (migration 007) n'existent pas encore, le claim
// échoue → on retombe sur un envoi best-effort (comportement actuel, sans
// régression). Dès la migration appliquée, l'idempotence s'active.

type EchecCtx = {
  paiementId: string;
  adherentId: string;
  prenom: string;
  nom: string;
  email: string | null;
  montant: number;
  date?: string | null;
  numero?: number | null;
  nbEcheances?: number | null;
  message?: string | null; // motif (derniere_erreur_stripe)
  code?: string | null; // decline_code (famille d'erreur)
};

// Claim atomique d'un flag booléen sur une ligne paiements.
// → true  : on VIENT de le poser (ou colonne absente = best-effort) → ENVOYER.
// → false : déjà posé (mail déjà parti) → NE PAS envoyer.
async function claim(
  supabase: SupabaseClient,
  paiementId: string,
  colonne: string,
): Promise<boolean> {
  const { data, error } = await supabase
    .from("paiements")
    .update({ [colonne]: true })
    .eq("id", paiementId)
    .eq(colonne, false)
    .select("id")
    .maybeSingle();
  // Colonne pas encore migrée → best-effort (on envoie, comportement actuel).
  if (error) return true;
  return !!data;
}

export async function notifierEchecPaiement(
  supabase: SupabaseClient,
  c: EchecCtx,
): Promise<void> {
  // Horodatage de l'échec (base du rappel J+48h). Best-effort (ignore l'erreur
  // si la colonne n'existe pas encore).
  await supabase
    .from("paiements")
    .update({ echec_a: new Date().toISOString() })
    .eq("id", c.paiementId)
    .is("echec_a", null);

  // 1) Mail ADHÉRENT (claim-then-send).
  if (c.email && (await claim(supabase, c.paiementId, "mail_echec_envoye"))) {
    try {
      await sendPaiementEchec({
        prenom: c.prenom,
        email: c.email,
        montant: c.montant,
        date: c.date,
        numero: c.numero,
        nbEcheances: c.nbEcheances,
        code: c.code,
      });
    } catch (e) {
      console.error("Email échec paiement (adhérent):", e);
    }
  }

  // 2) Alerte ADMIN (claim-then-send).
  if (await claim(supabase, c.paiementId, "mail_echec_admin_envoye")) {
    try {
      await sendAdminEchecPaiement({
        prenom: c.prenom,
        nom: c.nom,
        adherentId: c.adherentId,
        numero: c.numero,
        nbEcheances: c.nbEcheances,
        montant: c.montant,
        motif: c.message,
      });
    } catch (e) {
      console.error("Email échec paiement (admin):", e);
    }
  }
}
