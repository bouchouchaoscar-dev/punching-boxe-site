import { getAuthClient, isAuthConfigured } from "@/lib/supabase-auth";

// URL du site (prod) — jamais localhost dans l'email de réinitialisation.
export function baseSiteUrl(): string {
  return (
    process.env.NEXT_PUBLIC_SITE_URL ||
    (typeof window !== "undefined" ? window.location.origin : "")
  );
}

// SOURCE UNIQUE (client) du "mot de passe oublié / renvoyer un lien" : envoie un
// email de réinitialisation Supabase menant à /auth/reset-password. Réutilisé par
// la page de connexion (ConnexionForm) ET la page de définition de mot de passe
// (ResetPasswordForm, quand le lien a expiré). L'anti-énumération (message
// identique que le compte existe ou non) est gérée par l'appelant.
export async function demanderLienReset(email: string): Promise<void> {
  if (!isAuthConfigured()) throw new Error("Authentification non configurée.");
  await getAuthClient().auth.resetPasswordForEmail(email, {
    redirectTo: `${baseSiteUrl()}/auth/reset-password`,
  });
}
