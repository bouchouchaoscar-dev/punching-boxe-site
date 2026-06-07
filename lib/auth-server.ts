import { getSupabaseAdmin } from "./supabase";

export type AuthUser = { id: string; email: string | null };

/**
 * Valide le JWT Supabase Auth porté par l'en-tête `Authorization: Bearer …`
 * et renvoie l'utilisateur connecté (id = auth.users.id), ou null.
 *
 * SÉCURITÉ : c'est la SEULE source fiable de l'identité côté serveur. On ne
 * fait jamais confiance à un user_id envoyé dans le corps de la requête.
 */
export async function getAuthUser(request: Request): Promise<AuthUser | null> {
  const header = request.headers.get("authorization") || "";
  const token = header.replace(/^Bearer\s+/i, "").trim();
  if (!token) return null;
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase.auth.getUser(token);
  if (error || !data.user) return null;
  return { id: data.user.id, email: data.user.email ?? null };
}
