"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useAdherentSession } from "@/components/auth/useSession";
import { StripePayment, type StripePlan } from "./StripePayment";
import {
  euro,
  PACKAGE_LABEL,
  nbEcheances,
  type ModePaiement,
} from "@/lib/pricing";
import { echeancesAutorisees } from "@/lib/tarifs";
import type { Adherent } from "@/lib/types";

const PAYMENTS: { mode: ModePaiement; icon: string; label: string }[] = [
  { mode: "stripe_1x", icon: "💳", label: "Carte — 1 fois" },
  { mode: "stripe_2x", icon: "💳", label: "Carte — 2 fois" },
  { mode: "stripe_3x", icon: "💳", label: "Carte — 3 fois" },
  { mode: "stripe_4x", icon: "💳", label: "Carte — 4 fois" },
  { mode: "especes", icon: "💵", label: "Espèces au prochain cours" },
];

export function FinaliserPaiement({ id }: { id: string }) {
  const router = useRouter();
  const { session, loading } = useAdherentSession();
  const token = session?.access_token;

  const [adherent, setAdherent] = useState<Adherent | null>(null);
  const [fetching, setFetching] = useState(true);
  const [error, setError] = useState("");
  const [mode, setMode] = useState<ModePaiement | null>(null);
  const [plan, setPlan] = useState<StripePlan | null>(null);
  const [busy, setBusy] = useState(false);

  const CONNEXION_REDIRECT =
    "/inscription/connexion?message=" +
    encodeURIComponent("Connectez-vous pour finaliser votre paiement") +
    `&next=/inscription/finaliser/${id}`;

  const load = useCallback(async () => {
    if (!token) return;
    setFetching(true);
    try {
      const res = await fetch("/api/mon-espace", {
        headers: { Authorization: `Bearer ${token}` },
        cache: "no-store",
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Erreur.");
      const found = (data.adherents ?? []).find((a: Adherent) => a.id === id);
      if (!found) {
        setError("Dossier introuvable ou non rattaché à votre compte.");
      } else {
        setAdherent(found);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erreur.");
    } finally {
      setFetching(false);
    }
  }, [token, id]);

  useEffect(() => {
    if (!loading && !session) router.replace(CONNEXION_REDIRECT);
  }, [loading, session, router, CONNEXION_REDIRECT]);

  useEffect(() => {
    if (token) load();
  }, [token, load]);

  async function envoyer() {
    if (!mode || !token) return;
    setBusy(true);
    setError("");
    try {
      const res = await fetch("/api/mon-espace/finaliser", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ adherentId: id, mode_paiement: mode }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Finalisation impossible.");
      if (data.intentType === "especes") {
        router.push("/inscription/merci?mode=especes");
        return;
      }
      setPlan(data as StripePlan);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erreur.");
    } finally {
      setBusy(false);
    }
  }

  if (loading || (session && fetching)) {
    return (
      <div className="flex min-h-[50vh] items-center justify-center">
        <span className="h-9 w-9 animate-spin rounded-full border-2 border-ink/20 border-t-orange" />
      </div>
    );
  }
  if (!session) return null;

  if (error && !adherent) {
    return (
      <div className="rounded-[1.5rem] border border-line bg-white p-8 text-center">
        <p className="text-sm text-red-700">{error}</p>
        <Link
          href="/mon-espace"
          className="mt-4 inline-block font-bold text-orange hover:underline"
        >
          ← Retour à mon espace
        </Link>
      </div>
    );
  }
  if (!adherent) return null;

  const modesDispo = PAYMENTS.filter(
    (p) =>
      p.mode === "especes" ||
      echeancesAutorisees(new Date()).includes(nbEcheances(p.mode)),
  );

  return (
    <div>
      <Link
        href="/mon-espace"
        className="text-sm font-semibold text-smoke hover:text-ink"
      >
        ← Mon espace
      </Link>
      <h1 className="font-display mt-3 text-3xl font-extrabold uppercase text-ink sm:text-4xl">
        Finaliser le paiement
      </h1>
      <p className="mt-2 text-sm text-smoke">
        Dossier de <strong className="text-ink">{adherent.prenom} {adherent.nom}</strong>
        {adherent.package ? ` · ${PACKAGE_LABEL[adherent.package]}` : ""} ·{" "}
        <strong className="text-ink">{euro(adherent.montant_total)}</strong>
      </p>

      <div className="mt-8 rounded-[1.5rem] border border-line bg-white p-6 sm:p-8">
        {plan ? (
          <StripePayment plan={plan} onSuccess={() => router.push("/mon-espace")} />
        ) : (
          <>
            <p className="mb-3 font-display text-lg font-extrabold uppercase text-ink">
              Choisissez votre mode de règlement
            </p>
            <div className="grid gap-2.5 sm:grid-cols-2">
              {modesDispo.map((p) => {
                const active = mode === p.mode;
                return (
                  <button
                    key={p.mode}
                    type="button"
                    onClick={() => setMode(p.mode)}
                    className={`flex items-center gap-3 rounded-xl border-2 p-4 text-left transition-colors ${
                      active
                        ? "border-orange bg-orange-50"
                        : "border-line bg-white hover:border-orange/40"
                    }`}
                  >
                    <span className="text-xl">{p.icon}</span>
                    <span className="font-semibold text-ink">{p.label}</span>
                    <span
                      className={`ml-auto h-5 w-5 shrink-0 rounded-full border-2 ${
                        active ? "border-orange bg-orange" : "border-line"
                      }`}
                    />
                  </button>
                );
              })}
            </div>

            {error && (
              <p className="mt-4 rounded-xl bg-red-50 p-3 text-sm font-semibold text-red-700">
                {error}
              </p>
            )}

            <button
              onClick={envoyer}
              disabled={!mode || busy}
              className="mt-6 w-full rounded-full bg-orange px-6 py-3 text-sm font-bold text-white transition-colors hover:bg-orange/90 disabled:opacity-50 sm:w-auto"
            >
              {busy
                ? "…"
                : mode === "especes"
                  ? "Valider (paiement en espèces)"
                  : "Continuer vers le paiement"}
            </button>
          </>
        )}
      </div>
    </div>
  );
}
