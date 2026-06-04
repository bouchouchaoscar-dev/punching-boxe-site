import { createClient, type SupabaseClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL || "";
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "";
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || "";

export const STORAGE_BUCKET = "adherents-documents";

export function isSupabaseConfigured() {
  return Boolean(url && anonKey);
}

/** Client navigateur (clé anon) — RLS désactivé côté DB (outil interne). */
let browserClient: SupabaseClient | null = null;
export function getSupabaseBrowser(): SupabaseClient {
  if (!url || !anonKey) {
    throw new Error("Supabase non configuré (NEXT_PUBLIC_SUPABASE_URL / ANON_KEY).");
  }
  if (!browserClient) {
    browserClient = createClient(url, anonKey, {
      auth: { persistSession: false },
    });
  }
  return browserClient;
}

/** Client serveur privilégié (service role) pour les routes API. */
let adminClient: SupabaseClient | null = null;
export function getSupabaseAdmin(): SupabaseClient {
  const key = serviceKey || anonKey;
  if (!url || !key) {
    throw new Error("Supabase non configuré côté serveur.");
  }
  if (!adminClient) {
    adminClient = createClient(url, key, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
  }
  return adminClient;
}
