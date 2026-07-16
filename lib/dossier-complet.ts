import type { SupabaseClient } from "@supabase/supabase-js";
import { estEngage } from "./engagement";
import { evaluerDossier } from "./dossier";
import { sendDossierComplet } from "./email";

// Envoie le mail « dossier complet et validé » UNE SEULE FOIS, au moment où le
// dossier bascule à complet : paiement ENGAGÉ (1ère échéance / comptant /
// espèces confirmées) ET les 4 documents validés (fiche + règlement + photo +
// certificat). Idempotent : le flag mail_dossier_complet_envoye est posé de
// façon ATOMIQUE (update conditionnel) → un seul appel « gagne » et envoie,
// même si l'admin re-touche une pièce ensuite. Best-effort : toute erreur est
// journalisée et n'interrompt jamais la validation.
export async function notifierSiDossierComplet(
  supabase: SupabaseClient,
  adherentId: string,
): Promise<void> {
  try {
    const { data: a } = await supabase
      .from("adherents")
      .select(
        "id, prenom, email, statut_paiement, echeances_payees, fiche_valide, reglement_valide, photo_valide, certificat_valide, certificat_medical_url, mail_dossier_complet_envoye",
      )
      .eq("id", adherentId)
      .maybeSingle();
    if (!a || a.mail_dossier_complet_envoye) return;
    if (!estEngage(a)) return;
    if (evaluerDossier(a).statut !== "valide") return;

    // Pose le flag de façon atomique : seul le gagnant (flag encore false)
    // récupère une ligne → évite tout doublon entre appels concurrents.
    const { data: gagnant } = await supabase
      .from("adherents")
      .update({ mail_dossier_complet_envoye: true })
      .eq("id", adherentId)
      .eq("mail_dossier_complet_envoye", false)
      .select("id")
      .maybeSingle();
    if (!gagnant || !a.email) return;

    await sendDossierComplet({ prenom: a.prenom ?? "", email: a.email });
  } catch (e) {
    console.error("Mail dossier complet:", e);
  }
}
