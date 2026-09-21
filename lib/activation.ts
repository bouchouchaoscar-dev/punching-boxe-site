import { getSupabaseAdmin } from "@/lib/supabase";
import { SITE_URL } from "@/lib/constants";
import { sendActivationDossier } from "@/lib/email";

// SOURCE UNIQUE (serveur) : (re)génère un lien d'activation FRAIS pour un compte
// EXISTANT et l'envoie par notre mail Resend. Réutilisé par la création de dossier
// (creer) ET le bouton admin "Renvoyer le lien d'activation".
//
// Lien Supabase Auth de type "recovery" (définition/réinit du mot de passe) menant
// à /auth/reset-password, SANS email Supabase. NE crée NI compte NI dossier : agit
// sur le compte déjà présent (l'anti-doublon dossier n'est jamais contourné).
export async function envoyerLienActivation(
  email: string,
  prenom: string,
): Promise<{ envoye: boolean }> {
  const supabase = getSupabaseAdmin();
  const { data: linkData } = await supabase.auth.admin.generateLink({
    type: "recovery",
    email,
    options: { redirectTo: `${SITE_URL}/auth/reset-password` },
  });
  const lien = linkData?.properties?.action_link;
  if (!lien) return { envoye: false };
  try {
    const res = await sendActivationDossier({ prenom, email, lien });
    return { envoye: !(res as { skipped?: boolean })?.skipped };
  } catch (e) {
    console.error("Mail activation (ignoré):", e);
    return { envoye: false };
  }
}
