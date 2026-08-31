import type { Metadata } from "next";
import Link from "next/link";
import { verifyResignatureToken } from "@/lib/resignature-link";
import { getSupabaseAdmin, isSupabaseConfigured } from "@/lib/supabase";
import { construirePayloadsResignature } from "@/lib/resignature-data";
import { ResignerClient } from "@/components/resignature/ResignerClient";
import type { Adherent } from "@/lib/types";

export const metadata: Metadata = {
  title: "Re-signature de documents",
  robots: { index: false, follow: false },
};

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function Erreur({ message }: { message: string }) {
  return (
    <section className="container-px mx-auto max-w-lg pt-28 pb-20">
      <div className="rounded-[1.5rem] border border-line bg-white p-8 text-center">
        <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-paper-2 text-2xl">
          ⚠️
        </div>
        <h1 className="font-display mt-4 text-2xl font-extrabold uppercase text-ink">
          Lien indisponible
        </h1>
        <p className="mx-auto mt-3 max-w-md text-sm leading-relaxed text-smoke">
          {message}
        </p>
        <Link
          href="/"
          className="mt-5 inline-block font-bold text-orange hover:underline"
        >
          ← Retour à l&apos;accueil
        </Link>
      </div>
    </section>
  );
}

export default async function ReSignerPage({
  searchParams,
}: {
  searchParams: Promise<{ a?: string; doc?: string; exp?: string; t?: string }>;
}) {
  const { a = "", doc = "", exp = "", t = "" } = await searchParams;

  // 1) Token HMAC scopé + non expiré (fail-closed). Rien d'autre affiché sinon.
  const verified = verifyResignatureToken(a, doc, exp, t);
  if (!verified) {
    return (
      <Erreur message="Ce lien de re-signature est invalide ou a expiré. Contactez le club pour en recevoir un nouveau." />
    );
  }
  if (!isSupabaseConfigured()) {
    return <Erreur message="Service momentanément indisponible. Réessayez plus tard." />;
  }

  // 2) Dossier relu en base : le nom affiché est TOUJOURS celui de la base.
  const supabase = getSupabaseAdmin();
  const { data } = await supabase
    .from("adherents")
    .select("*")
    .eq("id", verified.adherentId)
    .maybeSingle();
  if (!data) {
    return <Erreur message="Dossier introuvable. Contactez le club." />;
  }
  const adherent = data as Adherent;

  // 3) Ne garder que les documents RÉELLEMENT flaggés « à re-signer ».
  const aResigner = verified.docs.filter((d) =>
    d === "fiche" ? adherent.fiche_a_resigner : adherent.reglement_a_resigner,
  );
  if (aResigner.length === 0) {
    return (
      <Erreur message="Aucun document n'est en attente de re-signature sur ce dossier (c'est peut-être déjà fait). Merci !" />
    );
  }

  const { fiche, reglement, mineur } = construirePayloadsResignature(
    adherent,
    aResigner,
  );

  return (
    <ResignerClient
      prenom={adherent.prenom ?? ""}
      mineur={mineur}
      responsableInitial={adherent.responsable ?? ""}
      token={{ a, doc, exp, t }}
      fiche={fiche}
      reglement={reglement}
    />
  );
}
