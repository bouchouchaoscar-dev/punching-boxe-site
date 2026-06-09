import type { Metadata } from "next";
import Link from "next/link";
import { verifierToken } from "@/lib/unsubscribe";
import { DesinscriptionClient } from "@/components/desinscription/DesinscriptionClient";

export const metadata: Metadata = {
  title: "Désinscription",
  robots: { index: false, follow: false },
};

export default async function DesinscriptionPage({
  searchParams,
}: {
  searchParams: Promise<{ e?: string; t?: string }>;
}) {
  const { e = "", t = "" } = await searchParams;
  const email = verifierToken(e, t);

  return (
    <section className="container-px mx-auto max-w-lg pt-28 pb-20">
      {email ? (
        <DesinscriptionClient e={e} t={t} email={email} />
      ) : (
        <div className="rounded-[1.5rem] border border-line bg-white p-8 text-center">
          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-paper-2 text-2xl">
            ⚠️
          </div>
          <h1 className="font-display mt-4 text-2xl font-extrabold uppercase text-ink">
            Lien invalide
          </h1>
          <p className="mx-auto mt-3 max-w-md text-sm leading-relaxed text-smoke">
            Ce lien de désinscription est invalide ou incomplet. Utilisez le lien
            présent en bas de l&apos;un de nos emails, ou contactez-nous.
          </p>
          <Link
            href="/"
            className="mt-5 inline-block font-bold text-orange hover:underline"
          >
            ← Retour à l&apos;accueil
          </Link>
        </div>
      )}
    </section>
  );
}
