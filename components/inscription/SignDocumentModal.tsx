"use client";

import { useEffect, useMemo, useState, type ReactNode } from "react";
import { motion } from "framer-motion";
import { SignaturePad } from "./SignaturePad";
import type {
  SignatureVect,
  FicheData,
  ReglementData,
} from "@/lib/pdf/types";

type PreviewPayload =
  | { doc: "fiche"; fiche: FicheData }
  | { doc: "reglement"; reglement: ReglementData };

// iOS / iPadOS gère mal les <iframe> PDF (souvent une zone vide). On bascule
// alors sur un panneau « appuyez pour ouvrir », l'ouverture plein écran (visionneuse
// native) restant la voie fiable. Détection au mieux (iPad récent = MacIntel + tactile).
function detectIOS(): boolean {
  if (typeof navigator === "undefined") return false;
  const ua = navigator.userAgent || "";
  if (/iP(hone|ad|od)/.test(ua)) return true;
  return navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1;
}

// Modale « Voir puis signer » : affiche le document RÉEL pré-rempli (sans
// signature), puis la case de certification + la signature, dans le contexte
// du document. Confirme une signature dédiée à CE document.
export function SignDocumentModal({
  title,
  payload,
  certifLabel,
  initialSignature,
  initialChecked,
  askResponsable = false,
  responsableInitial,
  askContacts = false,
  onConfirm,
  onClose,
}: {
  title: string;
  payload: PreviewPayload;
  certifLabel: ReactNode;
  initialSignature?: SignatureVect | null;
  initialChecked?: boolean;
  // Re-signature : champs NON persistés à l'inscription, redemandés DANS le
  // modal. Props optionnelles → l'usage inscription est inchangé (absentes).
  askResponsable?: boolean; // mineur : nom du représentant légal
  responsableInitial?: string | null;
  askContacts?: boolean; // fiche : personnes à prévenir en cas d'accident
  onConfirm: (
    sig: SignatureVect,
    signedAt: string,
    responsable?: string,
    contacts?: { nom: string; tel: string }[],
  ) => void;
  onClose: () => void;
}) {
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");
  const [blobUrl, setBlobUrl] = useState<string | null>(null);
  const [sig, setSig] = useState<SignatureVect | null>(initialSignature ?? null);
  const [checked, setChecked] = useState(!!initialChecked);
  const [responsable, setResponsable] = useState(responsableInitial ?? "");
  const [c1n, setC1n] = useState("");
  const [c1t, setC1t] = useState("");
  const [c2n, setC2n] = useState("");
  const [c2t, setC2t] = useState("");
  const isIOS = useMemo(detectIOS, []);

  // Sérialise le corps une fois : tant que la modale est ouverte, les données ne
  // changent pas (le formulaire est masqué derrière) → pas de refetch en boucle.
  const bodyStr = useMemo(() => JSON.stringify(payload), [payload]);

  // Récupère le PDF rempli (sans signature) → blob → URL d'objet pour l'iframe
  // et le bouton plein écran.
  useEffect(() => {
    let url: string | null = null;
    let aborted = false;
    (async () => {
      setStatus("loading");
      try {
        const res = await fetch("/api/documents/previsualiser", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: bodyStr,
        });
        if (!res.ok) throw new Error();
        const blob = await res.blob();
        if (aborted) return;
        url = URL.createObjectURL(blob);
        setBlobUrl(url);
        setStatus("ready");
      } catch {
        if (!aborted) setStatus("error");
      }
    })();
    return () => {
      aborted = true;
      if (url) URL.revokeObjectURL(url);
    };
  }, [bodyStr]);

  // Échap pour fermer + verrou de scroll du body.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [onClose]);

  function openFullscreen() {
    if (blobUrl) window.open(blobUrl, "_blank", "noopener,noreferrer");
  }

  const contactsOk = !askContacts || (c1n.trim().length > 0 && c1t.trim().length > 0);
  const canConfirm =
    sig !== null &&
    checked &&
    (!askResponsable || responsable.trim().length > 0) &&
    contactsOk;

  return (
    <div className="fixed inset-0 z-[80] flex items-stretch justify-center bg-ink/50 p-0 sm:items-center sm:p-4">
      <motion.div
        initial={{ opacity: 0, y: 16, scale: 0.99 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
        className="flex h-full w-full max-w-2xl flex-col bg-white sm:h-auto sm:max-h-[92vh] sm:rounded-[1.5rem]"
      >
        {/* En-tête */}
        <div className="flex items-center justify-between border-b border-line px-5 py-4">
          <h2 className="font-display text-lg font-extrabold uppercase text-ink">
            {title}
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Fermer"
            className="flex h-9 w-9 items-center justify-center rounded-full text-smoke transition-colors hover:bg-paper-2 hover:text-ink"
          >
            <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none">
              <path
                d="M6 6l12 12M18 6L6 18"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
              />
            </svg>
          </button>
        </div>

        {/* Corps scrollable */}
        <div className="flex-1 overflow-y-auto px-5 py-4">
          <p className="text-xs leading-relaxed text-smoke">
            Vérifiez vos informations ci-dessous, puis signez en bas du document.
          </p>

          {/* Aperçu du document */}
          <div className="mt-3">
            {status === "loading" && (
              <div className="flex h-48 items-center justify-center rounded-xl border border-line bg-paper-2">
                <span className="h-7 w-7 animate-spin rounded-full border-2 border-ink/20 border-t-orange" />
              </div>
            )}

            {status === "error" && (
              <div className="rounded-xl border border-line bg-paper-2 p-5 text-center text-sm text-smoke">
                L&apos;aperçu n&apos;a pas pu se charger. Vous pouvez tout de même
                signer ci-dessous, le document sera généré avec vos informations.
              </div>
            )}

            {status === "ready" && blobUrl && (
              <>
                {isIOS ? (
                  // iOS : pas d'iframe (souvent vide) → panneau d'ouverture fiable.
                  <button
                    type="button"
                    onClick={openFullscreen}
                    className="flex w-full flex-col items-center gap-2 rounded-xl border border-line bg-paper-2 p-6 text-center transition-colors hover:bg-paper"
                  >
                    <span className="flex h-12 w-12 items-center justify-center rounded-xl bg-orange/10 text-orange">
                      <svg viewBox="0 0 24 24" className="h-6 w-6" fill="none">
                        <path
                          d="M7 3h7l5 5v13H7a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2z"
                          stroke="currentColor"
                          strokeWidth="1.6"
                        />
                        <path
                          d="M14 3v5h5"
                          stroke="currentColor"
                          strokeWidth="1.6"
                          strokeLinecap="round"
                        />
                      </svg>
                    </span>
                    <span className="text-sm font-bold text-ink">
                      Appuyez pour ouvrir et lire le document
                    </span>
                    <span className="text-xs text-smoke">
                      Le document s&apos;ouvre en plein écran, puis revenez ici
                      pour signer.
                    </span>
                  </button>
                ) : (
                  <iframe
                    src={blobUrl}
                    title={`Aperçu : ${title}`}
                    className="h-[55vh] w-full rounded-xl border border-line bg-paper-2"
                  />
                )}
                <button
                  type="button"
                  onClick={openFullscreen}
                  className="mt-2 inline-flex items-center gap-1.5 text-xs font-bold text-orange hover:underline"
                >
                  Ouvrir en plein écran ↗
                </button>
              </>
            )}
          </div>

          {/* Certification propre au document */}
          <label className="mt-5 flex cursor-pointer items-start gap-3 rounded-xl border border-line bg-paper-2 p-4">
            <input
              type="checkbox"
              checked={checked}
              onChange={(e) => setChecked(e.target.checked)}
              className="mt-0.5 h-4 w-4 shrink-0 accent-orange"
            />
            <span className="text-sm leading-relaxed text-ink">
              {certifLabel} <span className="text-orange">*</span>
            </span>
          </label>

          {/* Nom du représentant légal (mineur, re-signature) — non stocké à
              l'inscription, redemandé ici. */}
          {askResponsable && (
            <label className="mt-4 block">
              <span className="text-sm font-semibold text-ink">
                Nom du représentant légal <span className="text-orange">*</span>
              </span>
              <input
                type="text"
                value={responsable}
                onChange={(e) => setResponsable(e.target.value)}
                placeholder="Prénom et nom du parent signataire"
                className="focus-ring mt-1.5 w-full rounded-xl border border-line bg-paper-2 px-4 py-3 text-ink outline-none transition-colors focus:border-orange"
              />
            </label>
          )}

          {/* Personnes à prévenir en cas d'accident (fiche, re-signature) —
              non stockées à l'inscription, redemandées ici. */}
          {askContacts && (
            <div className="mt-4">
              <p className="text-sm font-semibold text-ink">
                Personnes à prévenir en cas d&apos;accident{" "}
                <span className="text-orange">*</span>
              </p>
              <div className="mt-1.5 grid gap-2 sm:grid-cols-2">
                <input
                  type="text"
                  value={c1n}
                  onChange={(e) => setC1n(e.target.value)}
                  placeholder="Nom (obligatoire)"
                  className="focus-ring w-full rounded-xl border border-line bg-paper-2 px-4 py-3 text-ink outline-none transition-colors focus:border-orange"
                />
                <input
                  type="tel"
                  value={c1t}
                  onChange={(e) => setC1t(e.target.value)}
                  placeholder="Téléphone (obligatoire)"
                  className="focus-ring w-full rounded-xl border border-line bg-paper-2 px-4 py-3 text-ink outline-none transition-colors focus:border-orange"
                />
                <input
                  type="text"
                  value={c2n}
                  onChange={(e) => setC2n(e.target.value)}
                  placeholder="Nom (facultatif)"
                  className="focus-ring w-full rounded-xl border border-line bg-paper-2 px-4 py-3 text-ink outline-none transition-colors focus:border-orange"
                />
                <input
                  type="tel"
                  value={c2t}
                  onChange={(e) => setC2t(e.target.value)}
                  placeholder="Téléphone (facultatif)"
                  className="focus-ring w-full rounded-xl border border-line bg-paper-2 px-4 py-3 text-ink outline-none transition-colors focus:border-orange"
                />
              </div>
            </div>
          )}

          {/* Signature dans le contexte du document */}
          <div className="mt-4">
            <p className="text-sm font-semibold text-ink">
              Votre signature <span className="text-orange">*</span>
            </p>
            {initialSignature && (
              <p className="mt-0.5 text-xs text-smoke">
                Ce document est déjà signé. Re-signez ci-dessous pour le modifier.
              </p>
            )}
            <div className="mt-2">
              <SignaturePad onChange={setSig} />
            </div>
          </div>
        </div>

        {/* Pied : actions */}
        <div className="flex items-center justify-end gap-3 border-t border-line px-5 py-4">
          <button
            type="button"
            onClick={onClose}
            className="text-sm font-semibold text-smoke hover:text-ink"
          >
            Annuler
          </button>
          <button
            type="button"
            disabled={!canConfirm}
            onClick={() =>
              sig &&
              onConfirm(
                sig,
                new Date().toISOString(),
                askResponsable ? responsable.trim() : undefined,
                askContacts
                  ? [
                      { nom: c1n.trim(), tel: c1t.trim() },
                      ...(c2n.trim() || c2t.trim()
                        ? [{ nom: c2n.trim(), tel: c2t.trim() }]
                        : []),
                    ]
                  : undefined,
              )
            }
            className="rounded-full bg-orange px-5 py-2.5 text-sm font-bold text-white transition-colors hover:bg-orange/90 disabled:opacity-50"
          >
            Confirmer ma signature
          </button>
        </div>
      </motion.div>
    </div>
  );
}
