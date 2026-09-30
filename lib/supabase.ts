import { createClient, type SupabaseClient } from "@supabase/supabase-js";

// ---------------------------------------------------------------------------
// Garde anti-« erreur avalée ». RÈGLE (cf. LESSONS.md) : une requête Supabase EN
// ÉCHEC ne vaut JAMAIS « zéro résultat ». Le motif `const { data } = await …`
// suivi de `data ?? []` masque l'erreur : une requête cassée (colonne absente,
// RLS, réseau) est alors lue comme une liste vide → décisions fausses (0 dossier
// à relancer, 0 échéance due, etc.). `exigerData` lit `error` et LÈVE si présent ;
// il renvoie `data` tel quel (qui peut rester null pour un `.maybeSingle()`
// « introuvable » légitime — à gérer par l'appelant).
export function exigerData<T>(
  res: { data: T; error: { message: string } | null },
  contexte: string,
): T {
  if (res.error) {
    throw new Error(`[supabase] ${contexte}: ${res.error.message}`);
  }
  return res.data;
}

const url = process.env.NEXT_PUBLIC_SUPABASE_URL || "";
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "";
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || "";

export const STORAGE_BUCKET = "adherents-documents";

export function isSupabaseConfigured() {
  return Boolean(url && anonKey);
}

// Sécurité : la RLS est ACTIVÉE sur toutes les tables (deny-all sans policy) ;
// l'accès aux données se fait UNIQUEMENT côté serveur via la service role
// (getSupabaseAdmin), qui contourne la RLS. La clé anon publique ne sert qu'à
// l'authentification (cf. lib/supabase-auth.ts) — aucun client de DONNÉES anon
// n'est exposé ici, volontairement (pas d'accès anon accidentel aux tables).

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
