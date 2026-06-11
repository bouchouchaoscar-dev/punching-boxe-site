"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { PaiementStatut, StatutBadge } from "./StatutBadge";
import { EnvoiMailModal } from "./EnvoiMailModal";
import { GererPaiementModal } from "./GererPaiementModal";
import { HistoriqueSaisons, type HistLigne } from "./HistoriqueSaisons";
import { adminAuthHeaders } from "@/lib/admin-auth";
import { ButtonAction } from "@/components/ui/Button";
import { euro, PACKAGE_LABEL, TARIFS } from "@/lib/pricing";
import { formatDateFr } from "@/lib/tarifs";
import { formatTelephone } from "@/lib/telephone";
import { evaluerDossier, type DossierStatut } from "@/lib/dossier";
import { familleEchec, libelleEchecAdmin } from "@/lib/stripe-erreurs";
import type { Adherent, Paiement, StatutPaiement } from "@/lib/types";
import type { LienParente } from "@/lib/inscription";

// Ligne d'historique de remboursement (table remboursements).
type RemboursementLigne = {
  id: string;
  montant_effectif: number | null;
  canal: string | null; // 'stripe' | 'especes'
  ferme_inscription: boolean;
  created_at: string;
};

// Membre du foyer (même titulaire_id OU même foyer_id pour les comptes séparés).
type MembreFoyer = {
  id: string;
  nom: string;
  prenom: string;
  lien_parente: LienParente | null;
  type_adherent: "adulte" | "jeune" | null;
  statut_paiement: StatutPaiement;
  // Dossier rattaché via foyer_id depuis un AUTRE compte (paiement séparé).
  compte_separe?: boolean;
};

const LIEN_LABEL_COURT: Record<LienParente, string> = {
  moi: "Titulaire",
  enfant: "Enfant",
  frere_soeur: "Frère / sœur",
  conjoint: "Conjoint·e",
  autre: "Autre",
};

// Base de colonnes par document : <base>_valide (bool) + <base>_motif_refus (text).
type DocBase = "fiche" | "certificat" | "reglement" | "photo";

const MODE_LABEL: Record<string, string> = {
  stripe_1x: "Carte — 1 fois",
  stripe_2x: "Carte — 2 fois",
  stripe_3x: "Carte — 3 fois",
  stripe_4x: "Carte — 4 fois",
  especes: "Espèces",
};

const DOCS: {
  key: keyof Adherent;
  base: DocBase;
  label: string;
  obligatoire: boolean;
}[] = [
  { key: "fiche_inscription_url", base: "fiche", label: "Fiche d'inscription", obligatoire: true },
  { key: "certificat_medical_url", base: "certificat", label: "Certificat médical", obligatoire: false },
  { key: "reglement_url", base: "reglement", label: "Règlement intérieur", obligatoire: true },
  { key: "photo_url", base: "photo", label: "Photo d'identité", obligatoire: true },
];

export function FicheAdherent({ id }: { id: string }) {
  const [a, setA] = useState<Adherent | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState<Partial<Adherent>>({});
  const [toast, setToast] = useState<string | null>(null);
  const [refusing, setRefusing] = useState<DocBase | null>(null);
  const [refuseMotif, setRefuseMotif] = useState("");
  const [paiements, setPaiements] = useState<Paiement[]>([]);
  const [famille, setFamille] = useState<MembreFoyer[]>([]);
  const [histAncien, setHistAncien] = useState<HistLigne[]>([]);
  const [relancing, setRelancing] = useState(false);
  const [mailOpen, setMailOpen] = useState(false);
  const [gererOpen, setGererOpen] = useState(false);
  const [finOpen, setFinOpen] = useState(false);
  const [finishing, setFinishing] = useState(false);
  const [remboursements, setRemboursements] = useState<RemboursementLigne[]>([]);

  function showToast(msg: string) {
    setToast(msg);
    window.setTimeout(() => setToast(null), 3000);
  }

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [resA, resP, resF] = await Promise.all([
        fetch(`/api/adherents/${id}`, { cache: "no-store" }),
        fetch(`/api/adherents/${id}/paiements`, { cache: "no-store" }),
        fetch(`/api/adherents/${id}/famille`, { cache: "no-store" }),
      ]);
      const data = await resA.json();
      if (!resA.ok) throw new Error(data.error || "Introuvable.");
      setA(data.adherent);
      setForm(data.adherent);
      if (resP.ok) {
        const dp = await resP.json();
        setPaiements(dp.paiements ?? []);
      }
      if (resF.ok) {
        const df = await resF.json();
        setFamille(df.membres ?? []);
      }
      // Historique d'ancien (si ce dossier est un réinscrit lié par ancien_id).
      try {
        const resH = await fetch(
          `/api/admin/adherents/${id}/historique-ancien`,
          { headers: adminAuthHeaders(), cache: "no-store" },
        );
        if (resH.ok) {
          const dh = await resH.json();
          setHistAncien(dh.historique ?? []);
        }
      } catch {
        /* best-effort */
      }
      // Historique des remboursements du dossier.
      try {
        const resR = await fetch(
          `/api/admin/adherents/${id}/remboursements`,
          { headers: adminAuthHeaders(), cache: "no-store" },
        );
        if (resR.ok) {
          const dr = await resR.json();
          setRemboursements(dr.remboursements ?? []);
        }
      } catch {
        /* best-effort */
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erreur.");
    } finally {
      setLoading(false);
    }
  }, [id]);

  async function relancerPaiement() {
    setRelancing(true);
    try {
      const res = await fetch(`/api/adherents/${id}/paiements`, { method: "POST" });
      const data = await res.json().catch(() => ({}));
      await load();
      showToast(
        res.ok && data.ok
          ? "Prélèvement relancé ✓"
          : data.error || "Échec de la relance.",
      );
    } finally {
      setRelancing(false);
    }
  }

  // Fin d'inscription SANS mouvement d'argent (arrangement interne).
  async function finInscription() {
    setFinishing(true);
    try {
      const res = await fetch(`/api/admin/adherents/${id}/annuler`, {
        method: "POST",
        headers: adminAuthHeaders(),
      });
      const data = await res.json().catch(() => ({}));
      setFinOpen(false);
      await load();
      showToast(
        res.ok && data.success
          ? `Inscription terminée — ${data.echeancesAnnulees ?? 0} échéance(s) stoppée(s)`
          : data.error || "Action impossible.",
      );
    } finally {
      setFinishing(false);
    }
  }

  useEffect(() => {
    load();
  }, [load]);

  // Dès que l'admin ouvre la fiche : marquer comme vue → fait disparaître
  // définitivement le badge "Nouveau" dans la liste (best-effort).
  useEffect(() => {
    fetch(`/api/adherents/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ vu_par_admin: true }),
    }).catch(() => {});
  }, [id]);

  async function patch(body: Record<string, unknown>) {
    setSaving(true);
    try {
      const res = await fetch(`/api/adherents/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (res.ok) {
        setA(data.adherent);
        setForm(data.adherent);
        setEditing(false);
      }
      return res.ok;
    } finally {
      setSaving(false);
    }
  }

  // Valide / dé-valide un document. Valider efface aussi son motif de refus.
  async function setDocValide(base: DocBase, valide: boolean) {
    const ok = await patch({
      [`${base}_valide`]: valide,
      ...(valide ? { [`${base}_motif_refus`]: null } : {}),
    });
    if (ok) showToast(valide ? "Document validé ✓" : "Validation retirée");
  }

  // Refuse un document avec un motif (invalide + notifie l'adhérent par email).
  async function refuserDoc(base: DocBase) {
    if (!refuseMotif.trim()) return;
    const ok = await patch({
      [`${base}_valide`]: false,
      [`${base}_motif_refus`]: refuseMotif.trim(),
    });
    if (ok) {
      setRefusing(null);
      setRefuseMotif("");
      showToast("Document refusé — adhérent notifié ✓");
    }
  }

  if (loading)
    return (
      <div className="flex h-64 items-center justify-center">
        <span className="h-8 w-8 animate-spin rounded-full border-2 border-ink/20 border-t-orange" />
      </div>
    );

  if (error || !a)
    return (
      <div className="rounded-xl bg-amber-50 p-6 text-amber-800">
        {error || "Adhérent introuvable."}
        <div className="mt-4">
          <Link href="/admin/adherents" className="font-bold text-orange">
            ← Retour à la liste
          </Link>
        </div>
      </div>
    );

  const dossier = evaluerDossier(a);
  // X = échéances numérotées encaissées (une échéance remboursée a bien été
  // prélevée → comptée). S'actualise au fil des prélèvements cron.
  const paidEcheances = paiements.filter(
    (p) =>
      p.numero_echeance != null &&
      (p.statut === "paye" || p.statut === "rembourse"),
  ).length;

  return (
    <div>
      <Link
        href="/admin/adherents"
        className="text-sm font-semibold text-smoke hover:text-ink"
      >
        ← Tous les adhérents
      </Link>

      <div className="mt-4 grid gap-6 lg:grid-cols-[300px_1fr]">
        {/* Colonne gauche : photo + statut */}
        <div className="space-y-4">
          <div className="overflow-hidden rounded-[1.5rem] border border-line bg-white">
            <div className="relative aspect-square bg-paper-2">
              {a.photo_url ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={a.photo_url} alt={`${a.prenom} ${a.nom}`} className="h-full w-full object-cover" />
              ) : (
                <div className="flex h-full items-center justify-center font-display text-6xl font-black text-line">
                  {a.prenom[0]}
                  {a.nom[0]}
                </div>
              )}
            </div>
            <div className="p-5">
              <h1 className="font-display text-2xl font-extrabold uppercase text-ink">
                {a.prenom} {a.nom}
              </h1>
              <p className="mt-1 text-sm capitalize text-smoke">
                {a.type_adherent} · Saison {a.saison}
              </p>
              <div className="mt-3">
                <PaiementStatut adherent={a} paidEcheances={paidEcheances} />
              </div>
              {/* Reflet remboursement / litige / annulation */}
              {(a.annule_at || (a.montant_rembourse ?? 0) > 0 || a.litige) && (
                <div className="mt-3 space-y-1.5">
                  {a.annule_at && (
                    <span className="block rounded-lg bg-ink/5 px-3 py-1.5 text-xs font-bold text-ink">
                      ⛔ Fin d&apos;inscription le{" "}
                      {new Date(a.annule_at).toLocaleDateString("fr-FR")}
                    </span>
                  )}
                  {(a.montant_rembourse ?? 0) > 0 && (
                    <span className="block rounded-lg bg-amber-50 px-3 py-1.5 text-xs font-bold text-amber-800">
                      ↩️ Remboursé {euro(a.montant_rembourse ?? 0)}
                    </span>
                  )}
                  {a.litige && (
                    <span className="block rounded-lg bg-red-50 px-3 py-1.5 text-xs font-bold text-red-700">
                      ⚠️ Litige
                      {a.litige_statut === "gagne"
                        ? " (gagné)"
                        : a.litige_statut === "perdu"
                          ? " (perdu)"
                          : " (en cours)"}
                    </span>
                  )}
                </div>
              )}
              <button
                onClick={() => setMailOpen(true)}
                className="mt-4 w-full rounded-full border border-line bg-white px-4 py-2 text-sm font-bold text-ink transition-colors hover:border-orange hover:text-orange"
              >
                ✉ Envoyer un mail
              </button>
              <button
                onClick={() => setGererOpen(true)}
                className="mt-2 w-full rounded-full border border-line bg-white px-4 py-2 text-sm font-semibold text-ink transition-colors hover:border-orange hover:text-orange"
              >
                Gérer le paiement
              </button>
              {!a.annule_at && (
                <button
                  onClick={() => setFinOpen(true)}
                  className="mt-2 w-full rounded-full border border-line bg-white px-4 py-2 text-sm font-semibold text-red-600 transition-colors hover:border-red-300 hover:bg-red-50"
                >
                  Fin d&apos;inscription
                </button>
              )}
            </div>
          </div>

          {/* Paiement */}
          <div className="rounded-[1.5rem] border border-line bg-white p-5">
            <h3 className="text-xs font-bold uppercase tracking-wide text-smoke">
              Paiement
            </h3>
            <p className="font-display mt-2 text-3xl font-black text-orange">
              {euro(a.montant_total)}
            </p>
            <p className="mt-1 text-sm text-smoke">
              {MODE_LABEL[a.mode_paiement] ?? a.mode_paiement}
            </p>
            {a.mode_paiement === "especes" && a.statut_paiement === "en_attente" && (
              <ButtonAction
                onClick={() => patch({ action: "confirmer_especes" })}
                disabled={saving}
                size="md"
                className="mt-4 w-full"
              >
                {saving ? "…" : "Confirmer paiement espèces"}
              </ButtonAction>
            )}
          </div>

          {/* Historique des saisons — uniquement si réinscrit (ancien lié). */}
          {histAncien.length > 0 && (
            <div className="rounded-[1.5rem] border border-line bg-white p-5">
              <h3 className="font-display text-base font-extrabold uppercase text-ink">
                Historique des saisons
              </h3>
              <HistoriqueSaisons historique={histAncien} />
            </div>
          )}

          {/* Foyer — sous le bloc Paiement, dans la colonne de gauche. */}
          <FamilleCard membres={famille} currentId={a.id} />
        </div>

        {/* Colonne droite : infos + documents */}
        <div className="space-y-6">
          <div className="rounded-[1.5rem] border border-line bg-white p-6">
            <div className="flex items-center justify-between">
              <h3 className="font-display text-lg font-extrabold uppercase text-ink">
                Informations
              </h3>
              {!editing ? (
                <button
                  onClick={() => setEditing(true)}
                  className="text-sm font-bold text-orange"
                >
                  Modifier
                </button>
              ) : (
                <div className="flex gap-3">
                  <button
                    onClick={() => {
                      setEditing(false);
                      setForm(a);
                    }}
                    className="text-sm font-semibold text-smoke"
                  >
                    Annuler
                  </button>
                  <button
                    onClick={() =>
                      patch({
                        email: form.email,
                        telephone: form.telephone,
                        adresse: form.adresse,
                        ville: form.ville,
                        code_postal: form.code_postal,
                      })
                    }
                    disabled={saving}
                    className="text-sm font-bold text-orange"
                  >
                    {saving ? "…" : "Enregistrer"}
                  </button>
                </div>
              )}
            </div>

            <dl className="mt-5 grid gap-x-8 gap-y-4 sm:grid-cols-2">
              <Info
                label="Formule"
                value={a.package ? PACKAGE_LABEL[a.package] : "—"}
              />
              <Info label="Date de naissance" value={new Date(a.date_naissance).toLocaleDateString("fr-FR")} />
              <EditableInfo label="Email" editing={editing} value={form.email ?? ""} onChange={(v) => setForm({ ...form, email: v })} display={a.email} />
              <EditableInfo label="Téléphone" editing={editing} value={form.telephone ?? ""} onChange={(v) => setForm({ ...form, telephone: v })} display={a.telephone ? formatTelephone(a.telephone) : "—"} />
              <EditableInfo label="Adresse" editing={editing} value={form.adresse ?? ""} onChange={(v) => setForm({ ...form, adresse: v })} display={a.adresse ?? "—"} />
              <EditableInfo label="Code postal" editing={editing} value={form.code_postal ?? ""} onChange={(v) => setForm({ ...form, code_postal: v })} display={a.code_postal ?? "—"} />
              <EditableInfo label="Ville" editing={editing} value={form.ville ?? ""} onChange={(v) => setForm({ ...form, ville: v })} display={a.ville ?? "—"} />
              <Info label="Nouveau membre" value={a.nouveau_membre ? "Oui" : "Non"} />
              <Info label="Préparation physique" value={a.option_prepa_physique ? "Oui" : "Non"} />
            </dl>
          </div>

          {/* Documents */}
          <div className="rounded-[1.5rem] border border-line bg-white p-6">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <h3 className="font-display text-lg font-extrabold uppercase text-ink">
                Documents
              </h3>
              {/* Statut global DÉRIVÉ des 4 documents (certificat médical inclus). */}
              <DocsBadge statut={dossier.statut} />
            </div>
            <p className="mt-1.5 text-xs text-smoke">
              {dossier.valides}/{dossier.total} documents validés
              {dossier.statut === "valide"
                ? " — dossier complet ✅"
                : dossier.statut === "presque"
                  ? " — Certificat médical manquant"
                  : " — documents obligatoires manquants ou refusés"}
              . Le dossier est validé automatiquement une fois les 4 documents
              validés.
            </p>

            <div className="mt-5 space-y-3">
              {DOCS.map((d) => {
                const url = a[d.key] as string | null;
                const valide = !!a[`${d.base}_valide` as keyof Adherent];
                const motifRefus = a[
                  `${d.base}_motif_refus` as keyof Adherent
                ] as string | null;
                const enRefus = refusing === d.base;
                return (
                  <div
                    key={d.key}
                    className={`rounded-xl border p-4 ${
                      url ? "border-line" : "border-dashed border-line"
                    }`}
                  >
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <div className="min-w-0">
                        <p className="text-sm font-semibold text-ink">
                          {d.label}
                          {!d.obligatoire && (
                            <span className="ml-2 text-xs font-normal text-smoke">
                              (facultatif)
                            </span>
                          )}
                        </p>
                        {url ? (
                          <a
                            href={url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="mt-1 inline-block text-xs font-bold text-orange hover:underline"
                          >
                            Ouvrir →
                          </a>
                        ) : (
                          <span className="mt-1 inline-block rounded-full bg-paper-2 px-2.5 py-0.5 text-xs font-bold text-smoke">
                            Non fourni
                          </span>
                        )}
                      </div>

                      {url && !enRefus && (
                        <div className="flex shrink-0 items-center gap-3">
                          <label className="inline-flex cursor-pointer items-center gap-2">
                            <input
                              type="checkbox"
                              checked={valide}
                              disabled={saving}
                              onChange={(e) => setDocValide(d.base, e.target.checked)}
                              className="h-4 w-4 accent-green-600"
                            />
                            <span
                              className={`text-sm font-bold ${
                                valide ? "text-green-600" : "text-ink"
                              }`}
                            >
                              ✓ Valider
                            </span>
                          </label>
                          {!valide && (
                            <button
                              onClick={() => {
                                setRefusing(d.base);
                                setRefuseMotif(motifRefus ?? "");
                              }}
                              className="text-xs font-semibold text-smoke transition-colors hover:text-red-600"
                            >
                              Refuser
                            </button>
                          )}
                        </div>
                      )}
                    </div>

                    {/* Motif existant (document refusé) */}
                    {url && !enRefus && motifRefus && !valide && (
                      <p className="mt-2 rounded-lg bg-red-50 px-3 py-2 text-xs font-semibold text-red-700">
                        ❌ Refusé : {motifRefus}
                      </p>
                    )}

                    {/* Saisie du motif de refus */}
                    {enRefus && (
                      <div className="mt-3">
                        <textarea
                          value={refuseMotif}
                          onChange={(e) => setRefuseMotif(e.target.value)}
                          rows={2}
                          placeholder="Motif du refus (ex : document non signé)…"
                          className="focus-ring w-full rounded-xl border border-line bg-paper-2 px-3 py-2 text-sm outline-none focus:border-orange"
                        />
                        <div className="mt-2 flex items-center gap-3">
                          <button
                            onClick={() => refuserDoc(d.base)}
                            disabled={saving || !refuseMotif.trim()}
                            className="rounded-full bg-red-600 px-4 py-1.5 text-xs font-bold text-white transition-colors hover:bg-red-700 disabled:opacity-50"
                          >
                            {saving ? "…" : "Confirmer le refus"}
                          </button>
                          <button
                            onClick={() => {
                              setRefusing(null);
                              setRefuseMotif("");
                            }}
                            className="text-xs font-semibold text-smoke hover:text-ink"
                          >
                            Annuler
                          </button>
                        </div>
                        <p className="mt-1.5 text-xs text-smoke">
                          Un email est envoyé à l&apos;adhérent pour l&apos;inviter
                          à déposer un nouveau document.
                        </p>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          {/* Paiements */}
          <PaiementsCard
            adherent={a}
            paiements={paiements}
            relancing={relancing}
            onRelance={relancerPaiement}
          />

          {/* Historique des remboursements */}
          {remboursements.length > 0 && (
            <RemboursementsCard remboursements={remboursements} />
          )}
        </div>
      </div>

      {/* Envoi d'un mail individuel */}
      {mailOpen && (
        <EnvoiMailModal
          cible={{
            type: "natif",
            id: a.id,
            prenom: a.prenom,
            nom: a.nom,
            email: a.email,
            vars: {
              prenom: a.prenom,
              nom: a.nom,
              formule: a.package ? PACKAGE_LABEL[a.package] : "",
              montant: a.montant_total,
              saison: a.saison,
            },
          }}
          onClose={() => setMailOpen(false)}
          onSent={() => showToast("Mail envoyé ✓")}
        />
      )}

      {/* Gérer le paiement (remboursement / fin d'inscription) */}
      {gererOpen && (
        <GererPaiementModal
          adherent={a}
          paiements={paiements}
          onClose={() => setGererOpen(false)}
          onDone={(msg) => {
            setGererOpen(false);
            load();
            showToast(msg);
          }}
        />
      )}

      {/* Fin d'inscription (sans mouvement d'argent) */}
      {finOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink/40 p-4">
          <div className="w-full max-w-md rounded-[1.5rem] bg-white p-6 text-center">
            <h2 className="font-display text-xl font-extrabold uppercase text-ink">
              Fin d&apos;inscription ?
            </h2>
            <p className="mt-3 text-sm text-smoke">
              Le dossier de <strong>{a.prenom} {a.nom}</strong> sera fermé : il
              sort des effectifs actifs et des relances, et les échéances à venir
              sont stoppées. <strong>Aucun remboursement</strong> n&apos;est
              déclenché (pour rembourser, utilise « Gérer le paiement »).
            </p>
            <div className="mt-5 flex justify-center gap-3">
              <button
                onClick={() => setFinOpen(false)}
                disabled={finishing}
                className="rounded-full border border-line px-5 py-2.5 text-sm font-semibold text-ink"
              >
                Retour
              </button>
              <button
                onClick={finInscription}
                disabled={finishing}
                className="rounded-full bg-red-600 px-5 py-2.5 text-sm font-bold text-white transition-colors hover:bg-red-700 disabled:opacity-50"
              >
                {finishing ? "…" : "Confirmer la fin d'inscription"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Toast */}
      {toast && (
        <div className="fixed bottom-6 right-6 z-50 rounded-xl bg-ink px-5 py-3 text-sm font-bold text-white shadow-lg">
          {toast}
        </div>
      )}
    </div>
  );
}

function PaiementsCard({
  adherent,
  paiements,
  relancing,
  onRelance,
}: {
  adherent: Adherent;
  paiements: Paiement[];
  relancing: boolean;
  onRelance: () => void;
}) {
  // Encaissé NET = payé − remboursé (carte + espèces), depuis les paiements.
  const collectees = paiements.filter(
    (p) => p.statut === "paye" || p.statut === "rembourse",
  );
  const r2 = (n: number) => Math.round(n * 100) / 100;
  const paye = r2(collectees.reduce((s, p) => s + Number(p.montant || 0), 0));
  const rembourse = r2(
    collectees.reduce((s, p) => s + Number(p.montant_rembourse || 0), 0),
  );
  const encaisse = r2(paye - rembourse);
  const echec = adherent.statut_paiement === "echec_paiement";
  const echeances = paiements.filter((p) => p.numero_echeance != null);
  const supplements = paiements.filter((p) => p.numero_echeance == null);
  // ANCIENS dossiers (adhésion débitée à part, ligne numero=null) : on agrège ce
  // supplément sur la n°1 pour l'affichage (montants en base inchangés).
  const supplementImmediat = supplements.reduce(
    (s, p) => s + Number(p.montant || 0),
    0,
  );
  // Montant d'adhésion du dossier (déterministe). Sert à la NOTE "dont X€
  // d'adhésion incluse" : pour les NOUVEAUX dossiers, l'adhésion est déjà fondue
  // dans le montant de la n°1 (pas de ligne null), donc on l'affiche depuis ici.
  const adhesionDossier = adherent.nouveau_membre ? TARIFS.adhesion : 0;

  return (
    <div className="rounded-[1.5rem] border border-line bg-white p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h3 className="font-display text-lg font-extrabold uppercase text-ink">
          Paiements
        </h3>
        <span className="text-sm font-semibold text-smoke">
          {MODE_LABEL[adherent.mode_paiement] ?? adherent.mode_paiement}
          {adherent.nb_echeances > 1 ? ` · ${adherent.nb_echeances} échéances` : ""}
        </span>
      </div>

      {echec && (
        <div className="mt-4 rounded-xl border border-red-200 bg-red-50 p-4">
          <p className="text-sm font-bold text-red-700">
            ⚠️ Échec, {libelleEchecAdmin(adherent.derniere_erreur_code)}
          </p>
          {adherent.derniere_erreur_stripe && (
            <p className="mt-1 text-xs text-red-700">
              {adherent.derniere_erreur_stripe}
            </p>
          )}
          {familleEchec(adherent.derniere_erreur_code) === "carte_morte" ? (
            <p className="mt-3 text-xs font-semibold text-red-700">
              Carte invalide : retenter sur la même carte échouera. L&apos;adhérent
              doit régulariser lui-même avec une nouvelle carte depuis son espace.
            </p>
          ) : (
            <button
              onClick={onRelance}
              disabled={relancing}
              className="mt-3 rounded-full bg-red-600 px-4 py-1.5 text-xs font-bold text-white transition-colors hover:bg-red-700 disabled:opacity-50"
            >
              {relancing ? "Prélèvement…" : "Retenter le prélèvement"}
            </button>
          )}
        </div>
      )}

      <div className="mt-4 grid grid-cols-3 gap-3 text-center">
        <Stat label="Payé" value={euro(paye)} />
        <Stat label="Remboursé" value={euro(rembourse)} />
        <Stat label="Encaissé" value={euro(encaisse)} accent />
      </div>

      {echeances.length > 0 ? (
        <div className="mt-5 overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-line text-xs uppercase tracking-wide text-smoke">
                <th className="py-2 pr-3 font-bold">N°</th>
                <th className="py-2 pr-3 font-bold">Date prévue</th>
                <th className="py-2 pr-3 font-bold">Montant</th>
                <th className="py-2 font-bold">Statut</th>
              </tr>
            </thead>
            <tbody>
              {echeances.map((p) => (
                <tr key={p.id} className="border-b border-line last:border-0">
                  <td className="py-2 pr-3 font-semibold text-ink">
                    {p.numero_echeance}
                  </td>
                  <td className="py-2 pr-3 text-smoke">
                    {p.date_prevue ? formatDateFr(p.date_prevue) : "—"}
                  </td>
                  <td className="py-2 pr-3 font-semibold text-ink">
                    {euro(
                      Number(p.montant || 0) +
                        (p.numero_echeance === 1 ? supplementImmediat : 0),
                    )}
                  </td>
                  <td className="py-2">
                    <EcheanceStatut p={p} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {(supplementImmediat > 0 || adhesionDossier > 0) && (
            <p className="mt-2 text-xs text-smoke">
              + Adhésion {euro(supplementImmediat > 0 ? supplementImmediat : adhesionDossier)} incluse
              dans la 1ère échéance (prélevée à l&apos;inscription, non fractionnée).
            </p>
          )}
        </div>
      ) : (
        <p className="mt-5 text-sm text-smoke">
          Aucune échéance enregistrée (paiement en espèces ou non démarré).
        </p>
      )}
    </div>
  );
}

function RemboursementsCard({
  remboursements,
}: {
  remboursements: RemboursementLigne[];
}) {
  return (
    <div className="rounded-[1.5rem] border border-line bg-white p-6">
      <h3 className="font-display text-lg font-extrabold uppercase text-ink">
        Remboursements
      </h3>
      <ul className="mt-3 divide-y divide-line">
        {remboursements.map((r) => (
          <li
            key={r.id}
            className="flex flex-wrap items-center justify-between gap-2 py-2.5 text-sm"
          >
            <span className="flex items-center gap-2">
              <span className="font-semibold text-ink">
                {euro(Number(r.montant_effectif || 0))}
              </span>
              <span className="rounded-full bg-paper-2 px-2 py-0.5 text-[0.65rem] font-bold uppercase tracking-wide text-smoke">
                {r.canal === "especes" ? "Espèces" : "Carte"}
              </span>
              {r.ferme_inscription && (
                <span className="rounded-full bg-ink/10 px-2 py-0.5 text-[0.65rem] font-bold uppercase tracking-wide text-ink">
                  Fin d&apos;inscription
                </span>
              )}
            </span>
            <span className="text-smoke">
              {new Date(r.created_at).toLocaleDateString("fr-FR")}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function Stat({
  label,
  value,
  accent,
}: {
  label: string;
  value: string;
  accent?: boolean;
}) {
  return (
    <div className="rounded-xl border border-line bg-paper-2 p-3">
      <p className="text-[0.65rem] font-bold uppercase tracking-wide text-smoke">
        {label}
      </p>
      <p
        className={`font-display mt-1 text-lg font-black ${
          accent ? "text-orange" : "text-ink"
        }`}
      >
        {value}
      </p>
    </div>
  );
}

function EcheanceStatut({ p }: { p: Paiement }) {
  if (p.statut === "paye")
    return (
      <span className="font-semibold text-green-600">
        ✅ Payé{p.date_paiement ? ` le ${formatDateFr(p.date_paiement.slice(0, 10))}` : ""}
      </span>
    );
  if (p.statut === "echec")
    return <span className="font-semibold text-red-600">❌ Échec</span>;
  return (
    <span className="font-semibold text-orange">
      ⏳ Prévu{p.date_prevue ? ` le ${formatDateFr(p.date_prevue)}` : ""}
    </span>
  );
}

function FamilleCard({
  membres,
  currentId,
}: {
  membres: MembreFoyer[];
  currentId: string;
}) {
  // Replié par défaut au-delà de 4 membres pour ne pas dominer la page.
  const [open, setOpen] = useState(membres.length <= 4);
  // Pas de titulaire / pas de foyer → endpoint renvoie [] → on n'affiche rien.
  if (membres.length === 0) return null;

  return (
    <div className="rounded-[1.5rem] border border-line bg-white p-5">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center justify-between gap-3"
      >
        <h3 className="font-display text-base font-extrabold uppercase text-ink">
          Foyer{" "}
          <span className="text-sm font-semibold text-smoke">
            · {membres.length} dossier{membres.length > 1 ? "s" : ""}
          </span>
        </h3>
        <svg
          className={`h-4 w-4 shrink-0 text-smoke transition-transform ${open ? "rotate-180" : ""}`}
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

      {open && (
        <div className="mt-3 space-y-2">
          {membres.map((m) => {
            const current = m.id === currentId;
            const lien = m.lien_parente ? LIEN_LABEL_COURT[m.lien_parente] : "—";
            const cat = m.type_adherent === "jeune" ? "Jeune" : "Adulte";
            const inner = (
              <div
                className={`h-full rounded-xl border p-2.5 transition-colors ${
                  current
                    ? "border-orange/40 bg-orange-50"
                    : "border-line hover:border-orange/40"
                }`}
              >
                <p className="flex items-center gap-1.5 text-sm font-semibold text-ink">
                  <span className="truncate">
                    {m.prenom} {m.nom}
                  </span>
                  {current && (
                    <span className="shrink-0 rounded-full bg-orange px-1.5 py-0.5 text-[0.5rem] font-bold uppercase tracking-wide text-white">
                      Ce dossier
                    </span>
                  )}
                  {m.compte_separe && (
                    <span className="shrink-0 rounded-full bg-ink/10 px-1.5 py-0.5 text-[0.5rem] font-bold uppercase tracking-wide text-ink">
                      Compte séparé
                    </span>
                  )}
                </p>
                <p className="mt-0.5 text-xs text-smoke">
                  {lien} · {cat}
                </p>
                <div className="mt-1.5">
                  <StatutBadge statut={m.statut_paiement} />
                </div>
              </div>
            );
            return current ? (
              <div key={m.id}>{inner}</div>
            ) : (
              <Link key={m.id} href={`/admin/adherents/${m.id}`} className="block">
                {inner}
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}

function DocsBadge({ statut }: { statut: DossierStatut }) {
  const map = {
    valide: { cls: "bg-green-100 text-green-700", label: "Dossier validé ✓" },
    presque: { cls: "bg-orange-50 text-orange", label: "Presque complet ⚠️" },
    incomplet: { cls: "bg-red-100 text-red-700", label: "Incomplet ⏳" },
  }[statut];
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-bold ${map.cls}`}
    >
      {map.label}
    </span>
  );
}

function Info({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-xs font-bold uppercase tracking-wide text-smoke">
        {label}
      </dt>
      <dd className="mt-1 font-medium text-ink">{value}</dd>
    </div>
  );
}

function EditableInfo({
  label,
  editing,
  value,
  display,
  onChange,
}: {
  label: string;
  editing: boolean;
  value: string;
  display: string;
  onChange: (v: string) => void;
}) {
  return (
    <div>
      <dt className="text-xs font-bold uppercase tracking-wide text-smoke">
        {label}
      </dt>
      {editing ? (
        <input
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="focus-ring mt-1 w-full rounded-lg border border-line bg-paper-2 px-3 py-1.5 text-sm outline-none focus:border-orange"
        />
      ) : (
        <dd className="mt-1 font-medium text-ink">{display}</dd>
      )}
    </div>
  );
}
