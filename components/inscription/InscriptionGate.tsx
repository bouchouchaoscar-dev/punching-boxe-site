"use client";

import Link from "next/link";
import { useAdherentSession } from "@/components/auth/useSession";
import { InscriptionForm } from "./InscriptionForm";

const MESSAGE = "Créez votre compte pour vous inscrire";

/**
 * Garde d'accès au FORMULAIRE d'inscription : nécessite un compte adhérent.
 * Le téléchargement des PDF (section au-dessus) reste public.
 */
export function InscriptionGate() {
  const { session, loading } = useAdherentSession();

  if (loading) {
    return (
      <div className="flex h-40 items-center justify-center rounded-[2rem] border border-line bg-white">
        <span className="h-8 w-8 animate-spin rounded-full border-2 border-ink/20 border-t-orange" />
      </div>
    );
  }

  if (!session) {
    return (
      <div className="rounded-[2rem] border border-line bg-white p-8 text-center sm:p-12">
        <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-orange/10 text-2xl">
          🔒
        </div>
        <h3 className="font-display mt-5 text-2xl font-extrabold uppercase text-ink">
          {MESSAGE}
        </h3>
        <p className="mx-auto mt-3 max-w-md text-sm leading-relaxed text-smoke">
          L&apos;inscription en ligne se fait depuis votre espace personnel.
          Créez votre compte en moins d&apos;une minute pour démarrer et suivre
          votre dossier.
        </p>
        <div className="mt-6 flex flex-col justify-center gap-3 sm:flex-row">
          <Link
            href={`/inscription/connexion?message=${encodeURIComponent(MESSAGE)}&next=/inscription`}
            className="inline-flex items-center justify-center rounded-full bg-orange px-6 py-3 text-sm font-bold text-white transition-colors hover:bg-orange/90"
          >
            Créer mon compte
          </Link>
          <Link
            href={`/inscription/connexion?next=/inscription`}
            className="inline-flex items-center justify-center rounded-full border border-ink px-6 py-3 text-sm font-bold text-ink transition-colors hover:bg-paper-2"
          >
            J&apos;ai déjà un compte
          </Link>
        </div>
      </div>
    );
  }

  return <InscriptionForm lockedEmail={session.user.email ?? undefined} />;
}
