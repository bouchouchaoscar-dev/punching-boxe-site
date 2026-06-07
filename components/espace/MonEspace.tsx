"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useAdherentSession } from "@/components/auth/useSession";
import { getAuthClient } from "@/lib/supabase-auth";
import { PaiementStatut } from "@/components/admin/StatutBadge";
import { evaluerDossier, type DossierStatut } from "@/lib/dossier";
import type { FileFieldKey } from "@/components/inscription/FileDrop";
import { euro, PACKAGE_LABEL } from "@/lib/pricing";
import type { Adherent } from "@/lib/types";
import type { LienParente } from "@/lib/inscription";

const MODE_LABEL: Record<string, string> = {
  stripe_1x: "Carte — 1 fois",
  stripe_2x: "Carte — 2 fois",
  stripe_3x: "Carte — 3 fois",
  stripe_4x: "Carte — 4 fois",
  especes: "Espèces (au prochain cours)",
};

const LIEN_LABEL: Record<LienParente, string> = {
  moi: "Moi",
  enfant: "Mon enfant",
  conjoint: "Mon conjoint·e",
  autre: "Autre",
};

const DOCS: {
  key: keyof Adherent;
  base: "fiche" | "certificat" | "reglement" | "photo";
  field: FileFieldKey;
  label: string;
  accept: string;
}[] = [
  { key: "fiche_inscription_url", base: "fiche", field: "fiche_inscription", label: "Fiche d'inscription", accept: "application/pdf" },
  { key: "certificat_medical_url", base: "certificat", field: "certificat_medical", label: "Certificat médical", accept: "application/pdf" },
  { key: "reglement_url", base: "reglement", field: "reglement", label: "Règlement intérieur", accept: "application/pdf" },
  { key: "photo_url", base: "photo", field: "photo", label: "Photo d'identité", accept: "image/jpeg,image/png" },
];

const CONNEXION_REDIRECT =
  "/inscription/connexion?message=" +
  encodeURIComponent("Connectez-vous pour accéder à votre espace") +
  "&next=/mon-espace";

export function MonEspace() {
  const router = useRouter();
  const { session, loading } = useAdherentSession();
  const [adherents, setAdherents] = useState<Adherent[]>([]);
  const [paidMap, setPaidMap] = useState<Record<string, number>>({});
  const [openId, setOpenId] = useState<string | null>(null);
  const [fetching, setFetching] = useState(true);
  const [error, setError] = useState("");
  const [uploading, setUploading] = useState<string | null>(null); // `${id}:${field}`
  const [toast, setToast] = useState<string | null>(null);

  const token = session?.access_token;

  function showToast(msg: string) {
    setToast(msg);
    window.setTimeout(() => setToast(null), 3500);
  }

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
      const list: Adherent[] = data.adherents ?? [];
      setAdherents(list);
      setPaidMap(data.paidEcheances ?? {});
      // Ouvre le premier dossier par défaut (accordéon).
      setOpenId((cur) => cur ?? list[0]?.id ?? null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erreur.");
    } finally {
      setFetching(false);
    }
  }, [token]);

  useEffect(() => {
    if (!loading && !session) router.replace(CONNEXION_REDIRECT);
  }, [loading, session, router]);

  useEffect(() => {
    if (token) loadDossier();
  }, [token, loadDossier]);

  function deposer(field: FileFieldKey, accept: string, adherentId: string) {
    if (!token) return;
    const input = document.createElement("input");
    input.type = "file";
    input.accept = accept;
    input.onchange = async () => {
      const file = input.files?.[0];
      if (!file) return;
      setUploading(`${adherentId}:${field}`);
      try {
        const fd = new FormData();
        fd.append("file", file);
        fd.append("field", field);
        fd.append("adherentId", adherentId);
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
              ? "Certificat déposé, Pascal va valider le dossier !"
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

  return (
    <section className="container-px mx-auto max-w-4xl pt-28 pb-20">
      {/* Header */}
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <span className="eyebrow">Espace adhérent</span>
          <h1 className="font-display mt-2 text-4xl font-black uppercase text-ink sm:text-5xl">
            Votre espace adhérent
          </h1>
          <p className="mt-3 text-sm text-smoke">
            {adherents.length > 0
              ? `${adherents.length} dossier${adherents.length > 1 ? "s" : ""} rattaché${adherents.length > 1 ? "s" : ""} à votre compte.`
              : "Gérez ici les inscriptions de votre foyer."}
          </p>
        </div>
        <Link
          href="/inscription"
          className="inline-flex items-center justify-center rounded-full bg-orange px-5 py-3 text-sm font-bold text-white transition-colors hover:bg-orange/90"
        >
          + Ouvrir un nouveau dossier
        </Link>
      </div>

      {error && (
        <div className="mt-6 rounded-xl bg-amber-50 p-4 text-sm text-amber-800">
          {error}
        </div>
      )}

      {/* État vide */}
      {adherents.length === 0 ? (
        <div className="mt-10 rounded-[1.5rem] border border-dashed border-line bg-white p-10 text-center">
          <p className="font-display text-xl font-extrabold uppercase text-ink">
            Vous n&apos;avez pas encore de dossier
          </p>
          <p className="mx-auto mt-2 max-w-md text-sm text-smoke">
            Ouvrez un dossier d&apos;inscription pour vous-même, votre enfant ou
            votre conjoint·e. Vous pourrez en ajouter d&apos;autres à tout moment.
          </p>
          <Link
            href="/inscription"
            className="mt-5 inline-flex items-center justify-center rounded-full bg-orange px-6 py-3 text-sm font-bold text-white hover:bg-orange/90"
          >
            + Ouvrir un nouveau dossier d&apos;inscription
          </Link>
        </div>
      ) : (
        <div className="mt-10 space-y-4">
          {adherents.map((a) => {
            const dossier = evaluerDossier(a);
            const open = openId === a.id;
            return (
              <div
                key={a.id}
                className="overflow-hidden rounded-[1.5rem] border border-line bg-white"
              >
                {/* En-tête de carte (cliquable) */}
                <button
                  onClick={() => setOpenId(open ? null : a.id)}
                  aria-expanded={open}
                  className="flex w-full items-center gap-3 p-5 text-left transition-colors hover:bg-paper-2 sm:gap-4"
                >
                  <span className="flex h-11 w-11 shrink-0 items-center justify-center overflow-hidden rounded-full bg-paper-2 text-sm font-bold text-smoke">
                    {a.photo_url ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={a.photo_url} alt="" className="h-full w-full object-cover" />
                    ) : (
                      `${a.prenom[0] ?? ""}${a.nom[0] ?? ""}`
                    )}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="flex flex-wrap items-center gap-2">
                      <span className="font-display text-base font-extrabold uppercase text-ink">
                        {a.prenom} {a.nom}
                      </span>
                      <LienBadge lien={a.lien_parente} />
                    </span>
                    <span className="mt-2 flex flex-wrap items-center gap-2">
                      <DossierBadge statut={dossier.statut} />
                      <PaiementStatut adherent={a} paidEcheances={paidMap[a.id] ?? 0} />
                      <span className="text-xs text-smoke">
                        {a.package ? PACKAGE_LABEL[a.package] : "—"}
                      </span>
                    </span>
                  </span>
                  <svg
                    className={`h-5 w-5 shrink-0 text-smoke transition-transform ${open ? "rotate-180" : ""}`}
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <path d="m6 9 6 6 6-6" />
                  </svg>
                </button>

                {/* Corps déplié */}
                {open && (
                  <div className="grid gap-6 border-t border-line p-5 sm:p-6 lg:grid-cols-[1.3fr_1fr]">
                    {/* Documents */}
                    <div>
                      <h3 className="font-display text-sm font-extrabold uppercase text-ink">
                        Documents
                      </h3>
                      <div className="mt-3 space-y-3">
                        {DOCS.map((d) => {
                          const url = a[d.key] as string | null;
                          const motifRefus = a[
                            `${d.base}_motif_refus` as keyof Adherent
                          ] as string | null;
                          const valide = !!a[`${d.base}_valide` as keyof Adherent];
                          const statut = !url
                            ? "manquant"
                            : motifRefus
                              ? "refus"
                              : valide
                                ? "valide"
                                : "attente";
                          const isUp = uploading === `${a.id}:${d.field}`;
                          return (
                            <div
                              key={d.key}
                              className={`flex items-center justify-between gap-3 rounded-xl border p-4 ${
                                statut === "refus" ? "border-red-200 bg-red-50/40" : "border-line"
                              }`}
                            >
                              <div className="min-w-0">
                                <p className="text-sm font-semibold text-ink">{d.label}</p>
                                <DocStatus statut={statut} url={url} motif={motifRefus} />
                              </div>
                              {(statut === "manquant" || statut === "refus") && (
                                <button
                                  onClick={() => deposer(d.field, d.accept, a.id)}
                                  disabled={isUp}
                                  className={`shrink-0 whitespace-nowrap rounded-full px-3.5 py-2 text-xs font-bold transition-colors disabled:opacity-50 ${
                                    statut === "refus"
                                      ? "bg-red-600 text-white hover:bg-red-700"
                                      : "border border-line bg-white text-ink hover:border-orange hover:text-orange"
                                  }`}
                                >
                                  {isUp
                                    ? "Envoi…"
                                    : statut === "refus"
                                      ? "Remplacer"
                                      : d.field === "certificat_medical"
                                        ? "Déposer le certificat médical"
                                        : "Déposer"}
                                </button>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    </div>

                    {/* Inscription */}
                    <div className="h-fit rounded-[1.25rem] border border-line bg-paper-2 p-5">
                      <h3 className="font-display text-sm font-extrabold uppercase text-ink">
                        Inscription
                      </h3>
                      <dl className="mt-3 space-y-2.5 text-sm">
                        <Line label="Formule" value={a.package ? PACKAGE_LABEL[a.package] : "—"} />
                        <Line
                          label="Catégorie"
                          value={a.type_adherent === "jeune" ? "Jeune" : "Adulte"}
                        />
                        <Line label="Montant total" value={euro(a.montant_total)} />
                        <Line label="Mode de paiement" value={MODE_LABEL[a.mode_paiement] ?? a.mode_paiement} />
                        <div className="flex items-center justify-between gap-3">
                          <dt className="text-smoke">Paiement</dt>
                          <dd>
                            <PaiementStatut adherent={a} paidEcheances={paidMap[a.id] ?? 0} />
                          </dd>
                        </div>
                      </dl>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
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

function LienBadge({ lien }: { lien: LienParente | null }) {
  const label = lien ? LIEN_LABEL[lien] : "Dossier";
  return (
    <span className="inline-flex items-center rounded-full bg-orange-50 px-2.5 py-0.5 text-[0.7rem] font-bold uppercase tracking-wide text-orange">
      {label}
    </span>
  );
}

function DossierBadge({ statut }: { statut: DossierStatut }) {
  const map = {
    valide: { cls: "bg-green-50 text-green-700", label: "🟢 Dossier validé" },
    presque: { cls: "bg-orange-50 text-orange-600", label: "🟠 Certificat manquant" },
    incomplet: { cls: "bg-red-50 text-red-700", label: "🔴 Dossier incomplet" },
  }[statut];
  return (
    <span className={`inline-flex whitespace-nowrap rounded-full px-2.5 py-1 text-xs font-bold ${map.cls}`}>
      {map.label}
    </span>
  );
}

function DocStatus({
  statut,
  url,
  motif,
}: {
  statut: string;
  url: string | null;
  motif: string | null;
}) {
  if (statut === "manquant")
    return <p className="mt-1 text-xs font-semibold text-smoke">📎 Non fourni</p>;

  if (statut === "refus")
    return (
      <div className="mt-1">
        <p className="text-xs font-semibold text-red-600">
          ❌ Refusé{motif ? ` : ${motif}` : ""}
        </p>
        <a
          href={url ?? undefined}
          target="_blank"
          rel="noopener noreferrer"
          className="text-[0.7rem] font-semibold text-red-500 hover:underline"
        >
          voir le document actuel
        </a>
      </div>
    );

  if (statut === "valide")
    return (
      <a
        href={url ?? undefined}
        target="_blank"
        rel="noopener noreferrer"
        className="mt-1 inline-block text-xs font-semibold text-green-600 hover:underline"
      >
        ✅ Validé par Pascal — voir
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
