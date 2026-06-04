import { getSupabaseAdmin } from "./supabase";
import { sendAdherentConfirmation, sendAdminNotification } from "./email";
import type { Adherent } from "./types";

/**
 * Marque un adhérent comme payé (idempotent) et déclenche les emails
 * uniquement lors de la transition réelle vers « payé ».
 */
export async function markAdherentPaid(
  adherentId: string,
  paymentIntentId?: string,
): Promise<{ updated: boolean; adherent?: Adherent }> {
  const supabase = getSupabaseAdmin();

  const { data: current, error: readErr } = await supabase
    .from("adherents")
    .select("*")
    .eq("id", adherentId)
    .single();

  if (readErr || !current) return { updated: false };
  const adherent = current as Adherent;

  if (adherent.statut_paiement === "paye") {
    return { updated: false, adherent };
  }

  const { data: updated, error: updErr } = await supabase
    .from("adherents")
    .update({
      statut_paiement: "paye",
      ...(paymentIntentId ? { stripe_payment_intent_id: paymentIntentId } : {}),
    })
    .eq("id", adherentId)
    .select()
    .single();

  if (updErr) return { updated: false, adherent };

  try {
    await Promise.all([
      sendAdherentConfirmation({ ...adherent, adherentId }),
      sendAdminNotification({ ...adherent, adherentId }),
    ]);
  } catch (e) {
    console.error("Email error (markAdherentPaid):", e);
  }

  return { updated: true, adherent: updated as Adherent };
}
