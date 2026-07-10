"use client";

import { useCallback, useState } from "react";
import { useDropzone, type Accept, type FileRejection } from "react-dropzone";
import { PhotoCropModal } from "./PhotoCropModal";

export type FileFieldKey =
  | "fiche_inscription"
  | "certificat_medical"
  | "reglement"
  | "photo";

type Status = "empty" | "uploading" | "done" | "error" | "local";

export function FileDrop({
  field,
  adherentId,
  label,
  hint,
  accept,
  maxSizeMb,
  onChange,
  optional = false,
}: {
  field: FileFieldKey;
  adherentId: string;
  label: string;
  hint: string;
  accept: Accept;
  maxSizeMb: number;
  onChange: (field: FileFieldKey, value: { url: string | null; name: string }) => void;
  // Document facultatif (ex. certificat médical) : un échec d'upload ne doit
  // JAMAIS être un cul-de-sac. On offre une échappatoire claire + on rappelle
  // qu'on peut continuer sans.
  optional?: boolean;
}) {
  const [status, setStatus] = useState<Status>("empty");
  const [fileName, setFileName] = useState("");
  const [error, setError] = useState("");
  // Photo de profil : fichier en attente de recadrage (ouvre la modale).
  const [cropFile, setCropFile] = useState<File | null>(null);

  // Upload effectif (fichier OU blob recadré). `name` = nom de fichier envoyé.
  const uploadFile = useCallback(
    async (payload: Blob | File, name: string) => {
      setFileName(name);
      setStatus("uploading");
      setError("");
      const fd = new FormData();
      fd.append("file", payload, name);
      fd.append("adherentId", adherentId);
      fd.append("field", field);
      try {
        const res = await fetch("/api/upload-document", { method: "POST", body: fd });
        if (res.ok) {
          const data = await res.json();
          setStatus("done");
          onChange(field, { url: data.url, name });
        } else if (res.status === 503) {
          // Stockage non configuré → on accepte localement pour la démo.
          setStatus("local");
          onChange(field, { url: null, name });
        } else {
          const data = await res.json().catch(() => ({}));
          setStatus("error");
          setError(data.error || "Échec de l'envoi.");
        }
      } catch {
        setStatus("error");
        setError("Erreur réseau pendant l'envoi.");
      }
    },
    [adherentId, field, onChange],
  );

  // Efface un échec (ou un fichier déposé) et revient à l'état vide : indispensable
  // pour qu'une pièce facultative rejetée ne piège jamais l'utilisateur.
  const reset = useCallback(() => {
    setStatus("empty");
    setFileName("");
    setError("");
    onChange(field, { url: null, name: "" });
  }, [field, onChange]);

  const onDrop = useCallback(
    async (accepted: File[], rejected: FileRejection[]) => {
      setError("");
      if (rejected.length) {
        const code = rejected[0].errors[0]?.code;
        setStatus("error");
        setError(
          code === "file-too-large"
            ? `Fichier trop volumineux (max ${maxSizeMb} Mo).`
            : "Format de fichier non accepté.",
        );
        return;
      }
      const file = accepted[0];
      if (!file) return;
      // Photo de profil + image → recadrage AVANT upload.
      if (field === "photo" && file.type.startsWith("image/")) {
        setFileName(file.name);
        setCropFile(file);
        return;
      }
      await uploadFile(file, file.name);
    },
    [field, maxSizeMb, uploadFile],
  );

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept,
    maxSize: maxSizeMb * 1024 * 1024,
    multiple: false,
  });

  const ok = status === "done" || status === "local";

  return (
    <div>
      <div
        {...getRootProps()}
        className={`group flex cursor-pointer items-center gap-4 rounded-2xl border-2 border-dashed p-5 transition-colors ${
          isDragActive
            ? "border-orange bg-orange-50"
            : ok
              ? "border-orange/40 bg-orange-50/50"
              : status === "error"
                ? "border-red-300 bg-red-50"
                : "border-line bg-paper-2 hover:border-orange/50"
        }`}
      >
        <input {...getInputProps()} />
        <div
          className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-xl ${
            ok ? "bg-orange text-white" : "bg-white text-ink"
          }`}
        >
          {ok ? (
            <svg viewBox="0 0 24 24" className="h-6 w-6" fill="none">
              <path d="M5 13l4 4L19 7" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          ) : status === "uploading" ? (
            <span className="h-5 w-5 animate-spin rounded-full border-2 border-ink/20 border-t-ink" />
          ) : (
            <svg viewBox="0 0 24 24" className="h-6 w-6" fill="none">
              <path d="M12 16V4m0 0L8 8m4-4l4 4M4 16v2a2 2 0 002 2h12a2 2 0 002-2v-2" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          )}
        </div>
        <div className="min-w-0 flex-1">
          <p className="font-semibold text-ink">
            {label}
            {optional && (
              <span className="ml-2 text-xs font-normal text-smoke">
                · facultatif
              </span>
            )}
          </p>
          <p className="truncate text-xs text-smoke">
            {ok || status === "uploading" ? fileName : hint}
          </p>
        </div>
        {ok && (
          <span className="rounded-full bg-orange px-2.5 py-1 text-xs font-bold text-white">
            {status === "local" ? "Reçu" : "Envoyé"}
          </span>
        )}
      </div>
      {status === "error" && (
        <div className="mt-1.5 space-y-1">
          <p className="text-xs font-semibold text-red-600">{error}</p>
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs">
            <button
              type="button"
              onClick={reset}
              className="font-semibold text-smoke underline underline-offset-2 transition-colors hover:text-ink"
            >
              Réessayer
            </button>
            {optional && (
              <span className="text-smoke">
                Ce document est facultatif — vous pouvez continuer sans.
              </span>
            )}
          </div>
        </div>
      )}

      {cropFile && (
        <PhotoCropModal
          file={cropFile}
          onCancel={() => {
            setCropFile(null);
            if (status !== "done" && status !== "local") setStatus("empty");
          }}
          onConfirm={async (blob) => {
            setCropFile(null);
            await uploadFile(blob, "photo.jpg");
          }}
        />
      )}
    </div>
  );
}
