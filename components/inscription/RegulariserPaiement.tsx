"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useAdherentSession } from "@/components/auth/useSession";
import { StripePayment, type StripePlan } from "./StripePayment";
import { euro } from "@/lib/pricing";
import { estEngage } from "@/lib/engagement";
import type { Adherent } from "@/lib/types";

export function RegulariserPaiement({ id }: { id: string }) {
  const router = useRouter();
  const { session, loading } = useAdherentSession();
  const token = session?.access_token;

  const [adherent, setAdherent] = useState<Adherent | null>(null);
  const [fetching, setFetching] = useState(true);
  const [error, setError] = useState("");
  const [plan, setPlan] = useState<StripePlan | null>(null);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);

  // Après paiement réussi : message clair puis retour automatique à l'espace.
  useEffect(() => {
    if (!done) return;
    const t = window.setTimeout(() => router.push("/mon-espace"), 2800);
    return () => window.clearTimeout(t);
  }, [done, router]);

  const CONNEXION_REDIRECT =
    "/inscription/connexion?message=" +
    encodeURIComponent("Connectez-vous pour régulariser votre paiement") +
    `&next=/inscription/regulariser/${id}`;

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
      } else if (
        !estEngage(found) ||
        found.statut_paiement !== "echec_paiement"
      ) {
        setError("Aucune échéance en échec à régulariser sur ce dossier.");
        setAdherent(found);
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

  async function demarrer() {
    if (!token) return;
    setBusy(true);
    setError("");
    try {
      const res = await fetch("/api/mon-espace/regulariser", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ adherentId: id }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Régularisation impossible.");
      // Construit un StripePlan (paiement simple de l'échéance).
      setPlan({
        intentType: "payment",
        clientSecret: data.clientSecret,
        adherentId: id,
        paiementId: data.paiementId,
        nbEcheances: 1,
        total: data.montant,
        adhesion: 0,
        premierPrelevement: data.montant,
        dates: [],
        montants: [],
      });
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

  if (done) {
    return (
      <div className="rounded-[1.5rem] border border-green-200 bg-green-50 p-8 text-center">
        <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-green-100 text-2xl">
          ✅
        </div>
        <h1 className="font-display mt-4 text-2xl font-extrabold uppercase text-ink">
          Paiement réussi
        </h1>
        <p className="mx-auto mt-2 max-w-md text-sm text-smoke">
          Votre échéance a bien été réglée et votre carte est enregistrée pour
          les prochains prélèvements. Redirection vers votre espace…
        </p>
        <Link
          href="/mon-espace"
          className="mt-5 inline-block rounded-full bg-orange px-6 py-3 text-sm font-bold text-white hover:bg-orange/90"
        >
          Retour à mon espace
        </Link>
      </div>
    );
  }

  if (error && !plan) {
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

  return (
    <div>
      <Link
        href="/mon-espace"
        className="text-sm font-semibold text-smoke hover:text-ink"
      >
        ← Mon espace
      </Link>
      <h1 className="font-display mt-3 text-3xl font-extrabold uppercase text-ink sm:text-4xl">
        Régulariser le paiement
      </h1>
      <p className="mt-2 text-sm text-smoke">
        Dossier de{" "}
        <strong className="text-ink">
          {adherent.prenom} {adherent.nom}
        </strong>
        . Un prélèvement d&apos;échéance a échoué. Réglez l&apos;échéance avec une
        carte (nouvelle ou la même) ; elle deviendra votre carte par défaut pour
        les prochaines échéances.
      </p>

      <div className="mt-8 rounded-[1.5rem] border border-line bg-white p-6 sm:p-8">
        {plan ? (
          <>
            <p className="mb-4 text-sm font-semibold text-ink">
              Montant à régler : {euro(plan.total)}
            </p>
            <StripePayment
              plan={plan}
              confirmPath="/api/mon-espace/regulariser/confirm"
              onSuccess={() => setDone(true)}
            />
          </>
        ) : (
          <>
            <p className="text-sm text-smoke">
              Vous allez régler l&apos;échéance en échec et enregistrer votre
              carte pour les prochaines.
            </p>
            {error && (
              <p className="mt-4 rounded-xl bg-red-50 p-3 text-sm font-semibold text-red-700">
                {error}
              </p>
            )}
            <button
              onClick={demarrer}
              disabled={busy}
              className="mt-6 w-full rounded-full bg-orange px-6 py-3 text-sm font-bold text-white transition-colors hover:bg-orange/90 disabled:opacity-50 sm:w-auto"
            >
              {busy ? "…" : "Saisir ma carte et régler"}
            </button>
          </>
        )}
      </div>
    </div>
  );
}
