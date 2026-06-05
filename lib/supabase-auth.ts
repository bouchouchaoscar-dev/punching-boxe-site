import { createClient, type SupabaseClient } from "@supabase/supabase-js";

// Client navigateur DÉDIÉ à l'authentification des ADHÉRENTS (Supabase Auth).
// Distinct de getSupabaseBrowser() (persistSession: false) : ici on PERSISTE la
// session en localStorage pour garder l'adhérent connecté entre les visites.
// L'auth ADMIN reste séparée (localStorage maison, cf. lib/admin-auth.ts).

const url = process.env.NEXT_PUBLIC_SUPABASE_URL || "";
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "";

export function isAuthConfigured() {
  return Boolean(url && anonKey);
}

let authClient: SupabaseClient | null = null;
export function getAuthClient(): SupabaseClient {
  if (!url || !anonKey) {
    throw new Error("Supabase Auth non configuré (URL / ANON_KEY).");
  }
  if (!authClient) {
    authClient = createClient(url, anonKey, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        storageKey: "pbnp-adherent-auth",
      },
    });
  }
  return authClient;
}
