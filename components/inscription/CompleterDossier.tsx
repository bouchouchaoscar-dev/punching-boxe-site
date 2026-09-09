"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useAdherentSession } from "@/components/auth/useSession";
import { InscriptionForm } from "./InscriptionForm";
import type { Adherent } from "@/lib/types";

// Parcours de COMPLÉTION d'un dossier pré-créé par l'admin (tarif libre).
// 4a-2 : chargement + gardes (session, appartenance, dossier complétable) +
// récapitulatif verrouillé (posé par l'admin). Le formulaire d'identité +
// signatures (InscriptionForm en mode « compléter ») est branché au Lot 4a-3.
export function CompleterDossier({ id }: { id: string }) {
  const router = useRouter();
  const { session, loading } = useAdherentSession();
  const token = session?.access_token;

  const [adherent, setAdherent] = useState<Adherent | null>(null);
  const [fetching, setFetching] = useState(true);
  const [error, setError] = useState("");

  const CONNEXION_REDIRECT =
    "/inscription/connexion?message=" +
    encodeURIComponent("Connectez-vous pour compléter votre dossier") +
    `&next=/inscription/completer/${id}`;

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

  if (loading || fetching) {
    return (
      <div className="flex justify-center py-16">
        <span className="h-8 w-8 animate-spin rounded-full border-2 border-ink/20 border-t-orange" />
      </div>
    );
  }

  if (error || !adherent) {
    return (
      <div className="rounded-2xl bg-amber-50 p-6 text-amber-800">
        {error || "Dossier introuvable."}
        <div className="mt-4">
          <Link href="/mon-espace" className="font-bold text-orange">
            ← Retour à mon espace
          </Link>
        </div>
      </div>
    );
  }

  const a = adherent;

  return (
    <div>
      <h1 className="font-display text-3xl font-extrabold uppercase text-ink sm:text-4xl">
        Compléter mon dossier
      </h1>
      <p className="mt-2 text-sm text-smoke">
        Votre dossier a été ouvert par le club. Il ne reste plus qu&apos;à
        renseigner vos informations, signer les documents, puis régler votre
        cotisation.
      </p>

      {/* InscriptionForm en mode « compléter » : formule/prépa/montant/période
          verrouillés (récap dans l'étape Récapitulatif), identité + contacts +
          (représentant légal si mineur) + signatures à remplir. Submit →
          /api/mon-espace/completer, puis retour à l'espace. */}
      <div className="mt-6">
        <InscriptionForm
          lockedEmail={a.email}
          complete={{
            dossier: a,
            // Enchaînement naturel : complétion validée → paiement du dossier.
            // La page finaliser gère proprement un dossier introuvable/non
            // payable (message + retour à l'espace) → pas de plantage.
            onDone: () => router.replace(`/inscription/finaliser/${a.id}`),
          }}
        />
      </div>
    </div>
  );
}
