"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useAdherentSession } from "@/components/auth/useSession";
import { getAuthClient } from "@/lib/supabase-auth";
import { StatutBadge } from "@/components/admin/StatutBadge";
import type { FileFieldKey } from "@/components/inscription/FileDrop";
import { euro, PACKAGE_LABEL } from "@/lib/pricing";
import type { Adherent } from "@/lib/types";

const MODE_LABEL: Record<string, string> = {
  stripe_1x: "Carte — 1 fois",
  stripe_2x: "Carte — 2 fois",
  stripe_3x: "Carte — 3 fois",
  stripe_4x: "Carte — 4 fois",
  especes: "Espèces (au prochain cours)",
};

const DOCS: { key: keyof Adherent; field: FileFieldKey; label: string; accept: string }[] = [
  { key: "fiche_inscription_url", field: "fiche_inscription", label: "Fiche d'inscription", accept: "application/pdf" },
  { key: "certificat_medical_url", field: "certificat_medical", label: "Certificat médical", accept: "application/pdf" },
  { key: "reglement_url", field: "reglement", label: "Règlement intérieur", accept: "application/pdf" },
  { key: "photo_url", field: "photo", label: "Photo d'identité", accept: "image/jpeg,image/png" },
];

const CONNEXION_REDIRECT =
  "/inscription/connexion?message=" +
  encodeURIComponent("Connectez-vous pour accéder à votre espace") +
  "&next=/mon-espace";

export function MonEspace() {
  const router = useRouter();
  const { session, loading } = useAdherentSession();
  const [adherent, setAdherent] = useState<Adherent | null>(null);
  const [fetching, setFetching] = useState(true);
  const [error, setError] = useState("");
  const [uploading, setUploading] = useState<FileFieldKey | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  function showToast(msg: string) {
    setToast(msg);
    window.setTimeout(() => setToast(null), 3500);
  }

  const token = session?.access_token;

  const loadDossier = useCallback(async () => {
    if (!token) return;
    setFetching(true);
    try {
      const res = await fetch("/api/mon-espace", {
        headers: { Authorization: `Bearer ${token}` },
        cache: "no-store",
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Erreur.");
      setAdherent(data.adherent);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erreur.");
    } finally {
      setFetching(false);
    }
  }, [token]);

  // Redirection si non connecté.
  useEffect(() => {
    if (!loading && !session) router.replace(CONNEXION_REDIRECT);
  }, [loading, session, router]);

  useEffect(() => {
    if (token) loadDossier();
  }, [token, loadDossier]);

  function deposer(field: FileFieldKey, accept: string) {
    if (!token) return;
    const input = document.createElement("input");
    input.type = "file";
    input.accept = accept;
    input.onchange = async () => {
      const file = input.files?.[0];
      if (!file) return;
      setUploading(field);
      try {
        const fd = new FormData();
        fd.append("file", file);
        fd.append("field", field);
        const res = await fetch("/api/mon-espace", {
          method: "POST",
          headers: { Authorization: `Bearer ${token}` },
          body: fd,
        });
        const data = await res.json().catch(() => ({}));
        if (res.ok) {
          await loadDossier();
          showToast(
            field === "certificat_medical"
              ? "Certificat déposé, Pascal va valider votre dossier !"
              : "Document déposé ✓",
          );
        } else {
          showToast(data.error || "Échec de l'envoi.");
        }
      } catch {
        showToast("Erreur réseau pendant l'envoi.");
      } finally {
        setUploading(null);
      }
    };
    input.click();
  }

  async function deconnexion() {
    try {
      await getAuthClient().auth.signOut();
    } finally {
      router.replace("/");
    }
  }

  if (loading || (session && fetching)) {
    return (
      <div className="flex min-h-[70vh] items-center justify-center">
        <span className="h-9 w-9 animate-spin rounded-full border-2 border-ink/20 border-t-orange" />
      </div>
    );
  }
  if (!session) return null; // redirection en cours

  const prenom = adherent?.prenom || session.user.email?.split("@")[0] || "";
  const status = !adherent
    ? "aucun"
    : adherent.motif_refus_doc
      ? "refus"
      : adherent.documents_valides
        ? "valide"
        : "attente";

  return (
    <section className="container-px mx-auto max-w-4xl pt-28 pb-20">
      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <span className="eyebrow">Espace adhérent</span>
          <h1 className="font-display mt-2 text-4xl font-black uppercase text-ink sm:text-5xl">
            Bonjour {prenom}
          </h1>
          <div className="mt-4">
            <StatusBanner status={status} />
          </div>
        </div>
      </div>

      {error && (
        <div className="mt-6 rounded-xl bg-amber-50 p-4 text-sm text-amber-800">
          {error}
        </div>
      )}

      {!adherent ? (
        <div className="mt-10 rounded-[1.5rem] border border-dashed border-line bg-white p-10 text-center">
          <p className="font-display text-xl font-extrabold uppercase text-ink">
            Aucun dossier rattaché
          </p>
          <p className="mx-auto mt-2 max-w-md text-sm text-smoke">
            Nous n&apos;avons pas encore trouvé d&apos;inscription liée à votre
            email. Finalisez votre inscription en ligne pour voir votre dossier
            ici.
          </p>
          <a
            href="/inscription"
            className="mt-5 inline-flex items-center justify-center rounded-full bg-orange px-6 py-3 text-sm font-bold text-white hover:bg-orange/90"
          >
            Aller au formulaire d&apos;inscription
          </a>
        </div>
      ) : (
        <div className="mt-10 grid gap-6 lg:grid-cols-[1.3fr_1fr]">
          {/* Mon dossier */}
          <div className="rounded-[1.5rem] border border-line bg-white p-6 sm:p-7">
            <h2 className="font-display text-lg font-extrabold uppercase text-ink">
              Mon dossier
            </h2>

            {adherent.motif_refus_doc && (
              <div className="mt-4 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
                <p className="font-bold">Action requise</p>
                <p className="mt-1">{adherent.motif_refus_doc}</p>
                <p className="mt-1 text-xs">
                  Déposez à nouveau le document concerné ci-dessous.
                </p>
              </div>
            )}

            <div className="mt-4 space-y-3">
              {DOCS.map((d) => {
                const url = adherent[d.key] as string | null;
                const isUploading = uploading === d.field;
                const statut = !url
                  ? "manquant"
                  : adherent.documents_valides
                    ? "depose"
                    : "attente";
                return (
                  <div
                    key={d.key}
                    className="flex items-center justify-between gap-3 rounded-xl border border-line p-4"
                  >
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-ink">{d.label}</p>
                      <DocStatus statut={statut} url={url} />
                    </div>
                    <button
                      onClick={() => deposer(d.field, d.accept)}
                      disabled={isUploading}
                      className="shrink-0 whitespace-nowrap rounded-full border border-line bg-white px-3.5 py-2 text-xs font-bold text-ink transition-colors hover:border-orange hover:text-orange disabled:opacity-50"
                    >
                      {isUploading
                        ? "Envoi…"
                        : url
                          ? "Remplacer"
                          : d.field === "certificat_medical"
                            ? "Déposer mon certificat médical"
                            : "Déposer"}
                    </button>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Mon inscription */}
          <div className="h-fit rounded-[1.5rem] border border-line bg-white p-6 sm:p-7">
            <h2 className="font-display text-lg font-extrabold uppercase text-ink">
              Mon inscription
            </h2>
            <dl className="mt-4 space-y-3 text-sm">
              <Line label="Formule" value={adherent.package ? PACKAGE_LABEL[adherent.package] : "—"} />
              <Line label="Montant total" value={euro(adherent.montant_total)} />
              <Line label="Mode de paiement" value={MODE_LABEL[adherent.mode_paiement] ?? adherent.mode_paiement} />
              <div className="flex items-center justify-between gap-3">
                <dt className="text-smoke">Statut paiement</dt>
                <dd>
                  <StatutBadge statut={adherent.statut_paiement} />
                </dd>
              </div>
            </dl>
          </div>
        </div>
      )}

      {/* Déconnexion */}
      <div className="mt-12 text-center">
        <button
          onClick={deconnexion}
          className="text-sm font-semibold text-smoke underline-offset-4 transition-colors hover:text-ink hover:underline"
        >
          Se déconnecter
        </button>
      </div>

      {toast && (
        <div className="fixed bottom-6 right-6 z-50 max-w-xs rounded-xl bg-ink px-5 py-3 text-sm font-bold text-white shadow-lg">
          {toast}
        </div>
      )}
    </section>
  );
}

function StatusBanner({ status }: { status: string }) {
  const map: Record<string, { emoji: string; text: string; cls: string }> = {
    valide: {
      emoji: "🟢",
      text: "Dossier validé — Bienvenue au club !",
      cls: "border-green-200 bg-green-50 text-green-700",
    },
    refus: {
      emoji: "🔴",
      text: "Action requise — Voir ci-dessous",
      cls: "border-red-200 bg-red-50 text-red-700",
    },
    attente: {
      emoji: "🟠",
      text: "Dossier en cours de validation",
      cls: "border-orange/30 bg-orange-50 text-orange",
    },
    aucun: {
      emoji: "⚪️",
      text: "Aucun dossier rattaché à votre compte",
      cls: "border-line bg-paper-2 text-smoke",
    },
  };
  const s = map[status] ?? map.attente;
  return (
    <span
      className={`inline-flex items-center gap-2 rounded-full border px-4 py-2 text-sm font-bold ${s.cls}`}
    >
      <span>{s.emoji}</span>
      {s.text}
    </span>
  );
}

function DocStatus({ statut, url }: { statut: string; url: string | null }) {
  if (statut === "manquant")
    return <p className="mt-1 text-xs font-semibold text-smoke">📎 Manquant</p>;
  if (statut === "depose")
    return (
      <a
        href={url ?? undefined}
        target="_blank"
        rel="noopener noreferrer"
        className="mt-1 inline-block text-xs font-semibold text-green-600 hover:underline"
      >
        ✅ Déposé — voir
      </a>
    );
  return (
    <a
      href={url ?? undefined}
      target="_blank"
      rel="noopener noreferrer"
      className="mt-1 inline-block text-xs font-semibold text-orange hover:underline"
    >
      ⏳ En attente de validation — voir
    </a>
  );
}

function Line({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <dt className="text-smoke">{label}</dt>
      <dd className="font-semibold text-ink">{value}</dd>
    </div>
  );
}
