"use client";

import { useCallback, useEffect, useState } from "react";
import Cropper from "react-easy-crop";
import "react-easy-crop/react-easy-crop.css";
import { cropToBlob, type Area } from "@/lib/crop-image";

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

  useEffect(() => {
    const url = URL.createObjectURL(file);
    setSrc(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);

  const onCropComplete = useCallback(
    (_area: Area, areaPixels: Area) => setAreaPx(areaPixels),
    [],
  );

  async function valider() {
    if (!areaPx || !src) return;
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
          Déplacez et zoomez pour bien cadrer le visage.
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

        <div className="mt-4 flex items-center gap-3">
          <span className="text-xs font-semibold uppercase tracking-wide text-smoke">
            Zoom
          </span>
          <input
            type="range"
            min={1}
            max={3}
            step={0.01}
            value={zoom}
            onChange={(e) => setZoom(Number(e.target.value))}
            aria-label="Zoom de la photo"
            className="flex-1 accent-orange"
          />
        </div>

        <div className="mt-5 flex items-center justify-end gap-3">
          <button
            onClick={onCancel}
            disabled={busy}
            className="text-sm font-semibold text-smoke hover:text-ink"
          >
            Annuler
          </button>
          <button
            onClick={valider}
            disabled={busy || !areaPx}
            className="rounded-full bg-orange px-5 py-2.5 text-sm font-bold text-white transition-colors hover:bg-orange/90 disabled:opacity-50"
          >
            {busy ? "Traitement…" : "Valider la photo"}
          </button>
        </div>
      </div>
    </div>
  );
}
