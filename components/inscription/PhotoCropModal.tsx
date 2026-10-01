"use client";

import { useCallback, useEffect, useState } from "react";
import Cropper from "react-easy-crop";
import "react-easy-crop/react-easy-crop.css";
import { cropToBlob, cadrageModifie, type Area } from "@/lib/crop-image";

// Modale de recadrage de la PHOTO DE PROFIL (carré 1:1, aperçu rond comme les
// avatars de l'admin). Drag + zoom tactile gérés par react-easy-crop.
// Renvoie un Blob JPEG ~600×600 via onConfirm ; l'appelant gère l'upload.
export function PhotoCropModal({
  file,
  onCancel,
  onConfirm,
}: {
  file: File;
  onCancel: () => void;
  onConfirm: (blob: Blob) => void | Promise<void>;
}) {
  const [src, setSrc] = useState("");
  const [crop, setCrop] = useState({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [areaPx, setAreaPx] = useState<Area | null>(null);
  const [busy, setBusy] = useState(false);
  // Rappel « visage dans le cercle » affiché UNIQUEMENT si l'utilisateur valide
  // sans avoir touché au zoom ni à la position (cadrage resté à l'état initial).
  const [confirmer, setConfirmer] = useState(false);
  const ajuste = cadrageModifie(zoom, crop);

  useEffect(() => {
    const url = URL.createObjectURL(file);
    setSrc(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);

  const onCropComplete = useCallback(
    (_area: Area, areaPixels: Area) => setAreaPx(areaPixels),
    [],
  );

  async function valider(force = false) {
    if (!areaPx || !src) return;
    // Rappel léger si rien n'a été ajusté : on demande confirmation une fois.
    if (!force && !ajuste) {
      setConfirmer(true);
      return;
    }
    setBusy(true);
    try {
      const blob = await cropToBlob(src, areaPx, 600, 0.9);
      await onConfirm(blob);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="fixed inset-0 z-[90] flex items-center justify-center bg-ink/60 p-4">
      <div className="w-full max-w-md rounded-[1.5rem] bg-white p-5 sm:p-6">
        <h2 className="font-display text-lg font-extrabold uppercase text-ink">
          Recadrez votre photo
        </h2>
        <p className="mt-1 text-sm text-smoke">
          Zoomez et déplacez pour que le visage remplisse le cercle.
        </p>

        <div className="relative mt-4 h-72 w-full overflow-hidden rounded-2xl bg-ink/90">
          {src && (
            <Cropper
              image={src}
              crop={crop}
              zoom={zoom}
              aspect={1}
              cropShape="round"
              showGrid={false}
              onCropChange={setCrop}
              onZoomChange={setZoom}
              onCropComplete={onCropComplete}
            />
          )}
        </div>

        {/* Zoom : loupe + curseur bien visible (mobile inclus). */}
        <div className="mt-4 flex items-center gap-3">
          <svg viewBox="0 0 24 24" className="h-5 w-5 shrink-0 text-smoke" fill="none" aria-hidden="true">
            <circle cx="11" cy="11" r="7" stroke="currentColor" strokeWidth="1.8" />
            <path d="m20 20-3.2-3.2M11 8v6M8 11h6" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
          </svg>
          <input
            type="range"
            min={1}
            max={3}
            step={0.01}
            value={zoom}
            onChange={(e) => setZoom(Number(e.target.value))}
            aria-label="Zoom de la photo"
            className="h-2 flex-1 cursor-pointer accent-orange"
          />
        </div>

        {confirmer ? (
          // Rappel léger (pas d'alerte rouge) : rien n'a été ajusté.
          <div className="mt-5 rounded-2xl border border-line bg-paper-2 p-4">
            <p className="text-sm font-semibold text-ink">Le visage remplit-il bien le cercle ?</p>
            <div className="mt-3 flex items-center justify-end gap-3">
              <button
                onClick={() => setConfirmer(false)}
                disabled={busy}
                className="text-sm font-semibold text-smoke hover:text-ink"
              >
                Ajuster
              </button>
              <button
                onClick={() => valider(true)}
                disabled={busy || !areaPx}
                className="rounded-full bg-orange px-5 py-2.5 text-sm font-bold text-white transition-colors hover:bg-orange/90 disabled:opacity-50"
              >
                {busy ? "Traitement…" : "Oui, c'est bon"}
              </button>
            </div>
          </div>
        ) : (
          <div className="mt-5 flex items-center justify-end gap-3">
            <button
              onClick={onCancel}
              disabled={busy}
              className="text-sm font-semibold text-smoke hover:text-ink"
            >
              Annuler
            </button>
            <button
              onClick={() => valider()}
              disabled={busy || !areaPx}
              className="rounded-full bg-orange px-5 py-2.5 text-sm font-bold text-white transition-colors hover:bg-orange/90 disabled:opacity-50"
            >
              {busy ? "Traitement…" : "Valider la photo"}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
