"use client";

import { useEffect, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import { getAuthClient, isAuthConfigured } from "@/lib/supabase-auth";

/** Suit la session adhérent Supabase Auth (réactif aux login/logout). */
export function useAdherentSession() {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!isAuthConfigured()) {
      setLoading(false);
      return;
    }
    const sb = getAuthClient();
    let active = true;

    sb.auth.getSession().then(({ data }) => {
      if (!active) return;
      setSession(data.session);
      setLoading(false);
    });

    const { data: sub } = sb.auth.onAuthStateChange((_event, s) => {
      setSession(s);
      setLoading(false);
    });

    return () => {
      active = false;
      sub.subscription.unsubscribe();
    };
  }, []);

  return { session, loading };
}
