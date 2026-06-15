"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useAdherentSession } from "@/components/auth/useSession";
import { getAuthClient } from "@/lib/supabase-auth";
import { PaiementStatut } from "@/components/admin/StatutBadge";
import {
  evaluerDossier,
  badgeDossierAdherent,
  type DossierTon,
} from "@/lib/dossier";
import { estEngage } from "@/lib/engagement";
import { syntheseDossier, type SyntheseTone } from "@/lib/synthese-dossier";
import type { FileFieldKey } from "@/components/inscription/FileDrop";
import { PhotoCropModal } from "@/components/inscription/PhotoCropModal";
import { euro, formuleLabel, remiseFamillePct } from "@/lib/pricing";
import { saisonCourante } from "@/lib/saison";
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
  frere_soeur: "Frère / sœur",
  conjoint: "Mon conjoint·e",
  autre: "Autre",
};

const DOCS: {
  key: keyof Adherent;
  base: "fiche" | "certificat" | "reglement" | "photo";
  field: FileFieldKey;
  label: string;
  accept: string;
  // Généré + signé en ligne à l'inscription (pas de dépôt manuel ici).
  enLigne?: boolean;
}[] = [
  { key: "fiche_inscription_url", base: "fiche", field: "fiche_inscription", label: "Fiche d'inscription", accept: "application/pdf", enLigne: true },
  { key: "certificat_medical_url", base: "certificat", field: "certificat_medical", label: "Certificat médical", accept: "application/pdf" },
  { key: "reglement_url", base: "reglement", field: "reglement", label: "Règlement intérieur", accept: "application/pdf", enLigne: true },
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
  const [saisonTab, setSaisonTab] = useState<string | null>(null);
  const [fetching, setFetching] = useState(true);
  const [error, setError] = useState("");
  const [uploading, setUploading] = useState<string | null>(null); // `${id}:${field}`
  const [toast, setToast] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null); // adherentId
  // Photo de profil à recadrer (re-dépôt depuis l'espace).
  const [cropPhoto, setCropPhoto] = useState<{ file: File; adherentId: string } | null>(null);
  const [deleting, setDeleting] = useState(false);

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
      // Cartes FERMÉES par défaut (pas d'ouverture automatique).
      // Onglet saison par défaut = saison courante si présente, sinon la plus récente.
      setSaisonTab((cur) => {
        if (cur) return cur;
        const dispo = [...new Set(list.map((a) => a.saison).filter(Boolean))]
          .sort()
          .reverse() as string[];
        if (dispo.length === 0) return null;
        const courante = saisonCourante(new Date());
        return dispo.includes(courante) ? courante : dispo[0];
      });
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

  // Upload effectif vers l'espace (fichier OU blob recadré).
  async function uploadEspace(
    payload: Blob | File,
    name: string,
    field: FileFieldKey,
    adherentId: string,
  ) {
    if (!token) return;
    setUploading(`${adherentId}:${field}`);
    try {
      const fd = new FormData();
      fd.append("file", payload, name);
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
            ? "Certificat déposé, votre dossier va être vérifié !"
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
  }

  function deposer(field: FileFieldKey, accept: string, adherentId: string) {
    if (!token) return;
    const input = document.createElement("input");
    input.type = "file";
    input.accept = accept;
    input.onchange = async () => {
      const file = input.files?.[0];
      if (!file) return;
      // Photo de profil + image → recadrage avant upload (même UX qu'à l'inscription).
      if (field === "photo" && file.type.startsWith("image/")) {
        setCropPhoto({ file, adherentId });
        return;
      }
      await uploadEspace(file, file.name, field, adherentId);
    };
    input.click();
  }

  async function supprimer(adherentId: string) {
    if (!token) return;
    setDeleting(true);
    try {
      const res = await fetch(`/api/mon-espace/${adherentId}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok) {
        setConfirmDelete(null);
        await loadDossier();
        showToast("Dossier supprimé.");
      } else {
        showToast(data.error || "Suppression impossible.");
      }
    } catch {
      showToast("Erreur réseau pendant la suppression.");
    } finally {
      setDeleting(false);
    }
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

  // Saisons présentes dans le foyer (triées, plus récente en 1er).
  const saisonsDispo = [...new Set(adherents.map((a) => a.saison).filter(Boolean))]
    .sort()
    .reverse() as string[];
  // Onglets seulement si le foyer a des dossiers sur PLUSIEURS saisons.
  const afficherOnglets = saisonsDispo.length > 1;
  // Dossiers affichés = ceux de la saison active (ou tous s'il n'y a qu'une saison).
  const dossiersVisibles =
    afficherOnglets && saisonTab
      ? adherents.filter((a) => a.saison === saisonTab)
      : adherents;

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

      {adherents.length > 0 && (
        <p className="mt-4 border-l-2 border-line pl-3 text-xs leading-relaxed text-smoke">
          Tant que votre paiement n&apos;a pas été validé (ou vos espèces remises
          au professeur), vous pouvez supprimer un dossier pour le recréer, par
          exemple si vous vous êtes trompé de formule.
        </p>
      )}

      {/* Onglets de saison (seulement si plusieurs saisons dans le foyer) */}
      {afficherOnglets && (
        <div
          className="mt-8 -mx-4 flex gap-2 overflow-x-auto px-4 pb-1 sm:mx-0 sm:px-0"
          role="tablist"
          aria-label="Saisons"
        >
          {saisonsDispo.map((s) => {
            const actif = s === saisonTab;
            return (
              <button
                key={s}
                role="tab"
                aria-selected={actif}
                onClick={() => {
                  setSaisonTab(s);
                  setOpenId(null);
                }}
                className={`shrink-0 whitespace-nowrap rounded-full px-4 py-2 text-sm font-bold transition-colors ${
                  actif
                    ? "bg-ink text-white"
                    : "border border-line bg-white text-ink/70 hover:text-ink"
                }`}
              >
                Saison {s}
              </button>
            );
          })}
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
          {dossiersVisibles.map((a) => {
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
                      <DossierBadge {...badgeDossierAdherent(a)} />
                      <PaiementStatut adherent={a} paidEcheances={paidMap[a.id] ?? 0} />
                      <span className="text-xs text-smoke">
                        {formuleLabel(a.package, a.option_prepa_physique)}
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
                  <div className="border-t border-line p-5 sm:p-6">
                    {/* Synthèse dynamique : où en est le dossier + prochaine action */}
                    <SyntheseEncart {...syntheseDossier(a, paidMap[a.id] ?? 0)} />

                    {/* Jauge de progression des pièces (sentiment d'avancement) */}
                    <JaugeDossier valides={dossier.valides} total={dossier.total} />

                    <div className="mt-5 grid gap-6 lg:grid-cols-[1.3fr_1fr]">
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
                              {/* Fiche & règlement : signés EN LIGNE → pas de dépôt manuel. */}
                              {d.enLigne && statut === "manquant" && (
                                <span className="shrink-0 text-right text-xs text-smoke">
                                  Signé en ligne lors de l&apos;inscription
                                </span>
                              )}
                              {!d.enLigne &&
                                (statut === "manquant" || statut === "refus") && (
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
                                          ? "Déposer le document du médecin"
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
                        <Line label="Formule" value={formuleLabel(a.package, a.option_prepa_physique)} />
                        <Line
                          label="Catégorie"
                          value={a.type_adherent === "jeune" ? "Jeune" : "Adulte"}
                        />
                        {remiseFamillePct(a.nb_membres_famille) > 0 && (
                          <Line
                            label="Réduction famille"
                            value={`-${remiseFamillePct(a.nb_membres_famille)}%`}
                          />
                        )}
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
                    <DossierActions
                      a={a}
                      onDelete={() => setConfirmDelete(a.id)}
                    />
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Recadrage de la photo de profil (re-dépôt) */}
      {cropPhoto && (
        <PhotoCropModal
          file={cropPhoto.file}
          onCancel={() => setCropPhoto(null)}
          onConfirm={async (blob) => {
            const { adherentId } = cropPhoto;
            setCropPhoto(null);
            await uploadEspace(blob, "photo.jpg", "photo", adherentId);
          }}
        />
      )}

      {/* Modal de confirmation de suppression */}
      {confirmDelete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink/40 p-4">
          <div className="w-full max-w-md rounded-[1.5rem] bg-white p-6 text-center">
            <h2 className="font-display text-xl font-extrabold uppercase text-ink">
              Supprimer ce dossier ?
            </h2>
            <p className="mt-3 text-sm text-smoke">
              Êtes-vous sûr ? Cette action est définitive.
            </p>
            <div className="mt-5 flex justify-center gap-3">
              <button
                onClick={() => setConfirmDelete(null)}
                disabled={deleting}
                className="rounded-full border border-line px-5 py-2.5 text-sm font-semibold text-ink"
              >
                Annuler
              </button>
              <button
                onClick={() => supprimer(confirmDelete)}
                disabled={deleting}
                className="rounded-full bg-red-600 px-5 py-2.5 text-sm font-bold text-white transition-colors hover:bg-red-700 disabled:opacity-50"
              >
                {deleting ? "Suppression…" : "Confirmer la suppression"}
              </button>
            </div>
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

function DossierActions({
  a,
  onDelete,
}: {
  a: Adherent;
  onDelete: () => void;
}) {
  // Dossier engagé : verrouillé, SAUF s'il a une échéance en échec → régularisation.
  if (estEngage(a)) {
    if (a.statut_paiement === "echec_paiement") {
      return (
        <div className="mt-5 flex flex-wrap gap-3 border-t border-line pt-4">
          <Link
            href={`/inscription/regulariser/${a.id}`}
            className="rounded-full bg-red-600 px-4 py-2 text-sm font-bold text-white transition-colors hover:bg-red-700"
          >
            Régulariser le paiement
          </Link>
        </div>
      );
    }
    return null;
  }
  const especesAttente =
    a.mode_paiement === "especes" && a.statut_paiement === "en_attente";
  return (
    <div className="mt-5 flex flex-wrap gap-3 border-t border-line pt-4">
      {/* Espèces en attente → pas de "finaliser" (fil rouge espèces conservé). */}
      {!especesAttente && (
        <Link
          href={`/inscription/finaliser/${a.id}`}
          className="rounded-full bg-orange px-4 py-2 text-sm font-bold text-white transition-colors hover:bg-orange/90"
        >
          Finaliser le paiement
        </Link>
      )}
      <button
        onClick={onDelete}
        className="rounded-full border border-line bg-white px-4 py-2 text-sm font-semibold text-red-600 transition-colors hover:border-red-300 hover:bg-red-50"
      >
        Supprimer ce dossier
      </button>
    </div>
  );
}

function SyntheseEncart({
  text,
  tone,
  rappel,
}: {
  text: string;
  tone: SyntheseTone;
  rappel?: string;
}) {
  const map: Record<SyntheseTone, { cls: string; icon: string }> = {
    success: { cls: "border-green-200 bg-green-50", icon: "🎉" },
    info: { cls: "border-line bg-paper-2", icon: "📩" },
    action: { cls: "border-orange/30 bg-orange-50", icon: "👉" },
    danger: { cls: "border-red-200 bg-red-50", icon: "⚠️" },
    cloture: { cls: "border-ink/15 bg-ink/5", icon: "🔒" },
  };
  const m = map[tone];
  return (
    <div className={`flex items-start gap-3 rounded-2xl border p-4 ${m.cls}`}>
      <span className="text-xl leading-none">{m.icon}</span>
      <div className="min-w-0">
        <p className="text-sm font-semibold leading-relaxed text-ink">{text}</p>
        {rappel && (
          <p className="mt-1.5 flex items-center gap-1.5 text-xs font-medium text-smoke">
            <span aria-hidden>💶</span>
            {rappel}
          </p>
        )}
      </div>
    </div>
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

function DossierBadge({ ton, label }: { ton: DossierTon; label: string }) {
  const cls: Record<DossierTon, string> = {
    complet: "bg-green-50 text-green-700",
    inscription_ok: "bg-green-50 text-green-700",
    verification: "bg-blue-50 text-blue-700",
    presque: "bg-orange-50 text-orange-600",
    incomplet: "bg-red-50 text-red-700",
  };
  return (
    <span className={`inline-flex whitespace-nowrap rounded-full px-2.5 py-1 text-xs font-bold ${cls[ton]}`}>
      {label}
    </span>
  );
}

// Jauge "X/4 pièces validées" : verte une fois complète, orange en cours.
function JaugeDossier({ valides, total }: { valides: number; total: number }) {
  const pct = total > 0 ? Math.round((valides / total) * 100) : 0;
  const complet = valides >= total;
  return (
    <div className="mt-4">
      <div className="mb-1.5 flex items-center justify-between text-xs font-semibold">
        <span className="text-ink">
          {valides}/{total} pièces validées
        </span>
        <span className="text-smoke">{pct}%</span>
      </div>
      <div className="h-2 overflow-hidden rounded-full bg-paper-2">
        <div
          className={`h-full rounded-full transition-all ${complet ? "bg-green-500" : "bg-orange"}`}
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
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
        ✅ Validé — voir
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
