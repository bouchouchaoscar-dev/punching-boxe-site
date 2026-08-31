"use client";

import { useState } from "react";
import { SignDocumentModal } from "@/components/inscription/SignDocumentModal";
import type { FicheData, ReglementData, SignatureVect } from "@/lib/pdf/types";

type Token = { a: string; doc: string; exp: string; t: string };
type DocKey = "fiche" | "reglement";

export function ResignerClient({
  prenom,
  mineur,
  responsableInitial,
  token,
  fiche,
  reglement,
}: {
  prenom: string;
  mineur: boolean;
  responsableInitial: string;
  token: Token;
  fiche: FicheData | null;
  reglement: ReglementData | null;
}) {
  const docs = [
    ...(fiche ? (["fiche"] as const) : []),
    ...(reglement ? (["reglement"] as const) : []),
  ] as DocKey[];

  const [open, setOpen] = useState<DocKey | null>(null);
  const [done, setDone] = useState<Record<DocKey, boolean>>({
    fiche: false,
    reglement: false,
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const meta: Record<DocKey, { label: string; certif: string }> = {
    fiche: {
      label: "Fiche d'inscription",
      certif:
        "Je certifie l'exactitude des informations de la fiche d'inscription.",
    },
    reglement: {
      label: "Règlement intérieur",
      certif: mineur
        ? "En tant que représentant légal, je certifie avoir pris connaissance du règlement intérieur et m'engage à le faire respecter."
        : "Lu et approuvé — j'accepte sans réserve le règlement intérieur.",
    },
  };

  async function handleConfirm(
    doc: DocKey,
    sig: SignatureVect,
    signedAt: string,
    responsable?: string,
  ) {
    setBusy(true);
    setError("");
    try {
      const res = await fetch("/api/re-signer", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...token,
          docToSign: doc,
          signature: sig,
          signedAt,
          responsable,
        }),
      });
      const data = await res.json();
      if (res.ok && data.received) {
        setDone((d) => ({ ...d, [doc]: true }));
        setOpen(null);
      } else {
        setError(data.error || "L'envoi a échoué. Réessayez.");
      }
    } catch {
      setError("Erreur réseau pendant l'envoi.");
    } finally {
      setBusy(false);
    }
  }

  const payloadFor = (doc: DocKey) =>
    doc === "fiche"
      ? ({ doc: "fiche", fiche: fiche! } as const)
      : ({ doc: "reglement", reglement: reglement! } as const);

  const tousFaits = docs.every((d) => done[d]);

  return (
    <section className="container-px mx-auto max-w-lg pt-28 pb-20">
      <div className="rounded-[1.5rem] border border-line bg-white p-6 sm:p-8">
        <h1 className="font-display text-2xl font-extrabold uppercase text-ink">
          Re-signature de vos documents
        </h1>
        <p className="mt-3 text-sm leading-relaxed text-smoke">
          {prenom ? `Bonjour ${prenom}, ` : "Bonjour, "}
          une correction a été apportée au dossier. Merci de re-signer le(s)
          document(s) ci-dessous : vérifiez le contenu, puis signez à l'écran.
          Vous ne modifiez aucune donnée — vous signez simplement la version à
          jour.
        </p>

        {tousFaits ? (
          <div className="mt-6 rounded-xl border border-green-200 bg-green-50/60 p-5 text-center">
            <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-green-100 text-2xl">
              ✅
            </div>
            <p className="mt-3 text-sm font-semibold text-ink">
              Merci ! Votre re-signature a bien été prise en compte.
            </p>
            <p className="mt-1 text-xs text-smoke">
              Vous pouvez fermer cette page.
            </p>
          </div>
        ) : (
          <div className="mt-6 space-y-3">
            {docs.map((d) => (
              <div
                key={d}
                className="flex items-center justify-between gap-3 rounded-xl border border-line p-4"
              >
                <p className="text-sm font-semibold text-ink">
                  {meta[d].label}
                </p>
                {done[d] ? (
                  <span className="shrink-0 rounded-full bg-green-100 px-3 py-1 text-xs font-bold text-green-700">
                    ✓ Signé
                  </span>
                ) : (
                  <button
                    onClick={() => {
                      setError("");
                      setOpen(d);
                    }}
                    className="shrink-0 rounded-full bg-orange px-4 py-2 text-xs font-bold text-white transition-colors hover:brightness-95"
                  >
                    Re-signer
                  </button>
                )}
              </div>
            ))}
          </div>
        )}

        {error && (
          <p className="mt-4 text-sm font-semibold text-red-600">{error}</p>
        )}
      </div>

      {open && (
        <SignDocumentModal
          title={meta[open].label}
          payload={payloadFor(open)}
          certifLabel={meta[open].certif}
          askResponsable={mineur}
          responsableInitial={responsableInitial}
          onConfirm={(sig, signedAt, responsable) =>
            !busy && handleConfirm(open, sig, signedAt, responsable)
          }
          onClose={() => !busy && setOpen(null)}
        />
      )}
    </section>
  );
}
