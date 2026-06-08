"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { AnimatePresence, motion } from "framer-motion";
import { Toggle } from "@/components/ui/Toggle";
import { DatePicker } from "@/components/ui/DatePicker";
import { ButtonAction } from "@/components/ui/Button";
import { FileDrop, type FileFieldKey } from "./FileDrop";
import { StripePayment, type StripePlan } from "./StripePayment";
import { PostalCityFields } from "./PostalCityFields";
import { formatPhone, normalizePhone } from "@/lib/format";
import {
  calculerTarif,
  euro,
  nbEcheances,
  type ModePaiement,
  type PackageType,
} from "@/lib/pricing";
import {
  devisPourAdherent,
  planEcheances,
  formatDateFr,
} from "@/lib/tarifs";
import { PACKAGES } from "@/lib/constants";
import {
  LIENS_PARENTE,
  type InscriptionPayload,
  type LienParente,
} from "@/lib/inscription";
import { useAdherentSession } from "@/components/auth/useSession";

const STEPS = ["Informations", "Options", "Documents", "Paiement"];

// Libellés du choix "Ce dossier concerne".
const LIEN_LABEL: Record<LienParente, string> = {
  moi: "Moi-même",
  enfant: "Mon enfant",
  frere_soeur: "Frère / sœur",
  conjoint: "Mon conjoint·e",
  autre: "Autre",
};

type FileState = Record<FileFieldKey, { url: string | null; name: string }>;
const EMPTY_FILE = { url: null, name: "" };

const PAYMENTS: { mode: ModePaiement; icon: string; label: string }[] = [
  { mode: "stripe_1x", icon: "💳", label: "Carte — 1 fois" },
  { mode: "stripe_2x", icon: "💳", label: "Carte — 2 fois" },
  { mode: "stripe_3x", icon: "💳", label: "Carte — 3 fois" },
  { mode: "stripe_4x", icon: "💳", label: "Carte — 4 fois" },
  { mode: "especes", icon: "💵", label: "Espèces au prochain cours" },
];

export function InscriptionForm({ lockedEmail }: { lockedEmail?: string } = {}) {
  const router = useRouter();
  const { session } = useAdherentSession();
  const token = session?.access_token;
  const [adherentId] = useState(() =>
    typeof crypto !== "undefined" && crypto.randomUUID
      ? crypto.randomUUID()
      : `pbnp-${Date.now()}`,
  );
  const [step, setStep] = useState(0);

  // Champs
  const [nom, setNom] = useState("");
  const [prenom, setPrenom] = useState("");
  const [dateNaissance, setDateNaissance] = useState("");
  const [email, setEmail] = useState(lockedEmail ?? "");
  const [telephone, setTelephone] = useState("");
  const [adresse, setAdresse] = useState("");
  const [ville, setVille] = useState("");
  const [codePostal, setCodePostal] = useState("");

  const [lienParente, setLienParente] = useState<LienParente | "">("");
  const [packageType, setPackageType] = useState<PackageType>("boxe_classique");
  const [nouveauMembre, setNouveauMembre] = useState(true);
  const [prepa, setPrepa] = useState(false);
  const [nbFamille, setNbFamille] = useState(0);

  const [files, setFiles] = useState<FileState>({
    fiche_inscription: EMPTY_FILE,
    certificat_medical: EMPTY_FILE,
    reglement: EMPTY_FILE,
    photo: EMPTY_FILE,
  });

  const [mode, setMode] = useState<ModePaiement | null>(null);
  const [accepteConditions, setAccepteConditions] = useState(false);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  // Stripe
  const [plan, setPlan] = useState<StripePlan | null>(null);

  // Remise famille AUTO : on récupère le nombre de dossiers déjà rattachés au
  // compte → aperçu de prix juste (le serveur recompte et fait foi à la création).
  useEffect(() => {
    if (!token) return;
    fetch("/api/mon-espace/count", {
      headers: { Authorization: `Bearer ${token}` },
      cache: "no-store",
    })
      .then((r) => r.json())
      .then((d) => {
        if (typeof d?.count === "number") setNbFamille(d.count);
      })
      .catch(() => {
        /* fallback : nbFamille reste 0 (aucune remise affichée) */
      });
  }, [token]);

  const tarif = useMemo(
    () =>
      calculerTarif({
        dateNaissance,
        packageType,
        nouveauMembre,
        optionPrepaPhysique: prepa,
        nbMembresFamille: nbFamille,
      }),
    [dateNaissance, packageType, nouveauMembre, prepa, nbFamille],
  );

  // Devis proratisé (selon la date du jour) + échéances autorisées.
  const devis = useMemo(
    () =>
      devisPourAdherent(
        {
          date_naissance: dateNaissance || "2000-01-01",
          package: packageType,
          nouveau_membre: nouveauMembre,
          option_prepa_physique: prepa,
          nb_membres_famille: nbFamille,
        },
        new Date(),
      ),
    [dateNaissance, packageType, nouveauMembre, prepa, nbFamille],
  );

  const payload = (): InscriptionPayload => ({
    nom,
    prenom,
    date_naissance: dateNaissance,
    email,
    telephone,
    adresse,
    ville,
    code_postal: codePostal,
    package: packageType,
    nouveau_membre: nouveauMembre,
    option_prepa_physique: prepa,
    nb_membres_famille: nbFamille,
    mode_paiement: mode ?? "especes",
    // Choix explicite garanti par le gating step1Ok (jamais de défaut silencieux).
    lien_parente: lienParente as LienParente,
    photo_url: files.photo.url,
    fiche_inscription_url: files.fiche_inscription.url,
    certificat_medical_url: files.certificat_medical.url,
    reglement_url: files.reglement.url,
  });

  const emailOk = /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email);
  const step1Ok =
    !!lienParente && nom.trim() && prenom.trim() && dateNaissance && emailOk;
  // Documents OBLIGATOIRES (le certificat médical est facultatif : déposable
  // plus tard depuis l'espace adhérent).
  const REQUIRED_FILES: FileFieldKey[] = [
    "fiche_inscription",
    "reglement",
    "photo",
  ];
  const requiredFilesOk = REQUIRED_FILES.every((k) => files[k].name);

  function onFile(field: FileFieldKey, v: { url: string | null; name: string }) {
    setFiles((f) => ({ ...f, [field]: v }));
  }

  function next() {
    setError("");
    setStep((s) => Math.min(STEPS.length - 1, s + 1));
  }
  function prev() {
    setError("");
    setPlan(null);
    setStep((s) => Math.max(0, s - 1));
  }

  async function submitEspeces() {
    if (!accepteConditions) return;
    setBusy(true);
    setError("");
    try {
      const res = await fetch("/api/adherents", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ ...payload(), mode_paiement: "especes" }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Erreur lors de l'inscription.");
      router.push("/inscription/merci?mode=especes");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erreur inconnue.");
      setBusy(false);
    }
  }

  async function startStripe() {
    if (!mode || !accepteConditions) return;
    setBusy(true);
    setError("");
    try {
      const res = await fetch("/api/create-payment-intent", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify(payload()),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Paiement indisponible.");
      setPlan(data as StripePlan);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erreur Stripe.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="overflow-hidden rounded-[2rem] border border-line bg-white">
      {/* Stepper */}
      <div className="border-b border-line bg-paper-2 px-6 py-5 sm:px-8">
        <div className="flex items-center justify-between">
          {STEPS.map((s, i) => (
            <div key={s} className="flex flex-1 items-center last:flex-none">
              <div className="flex items-center gap-2.5">
                <span
                  className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-sm font-bold transition-colors ${
                    i < step
                      ? "bg-orange text-white"
                      : i === step
                        ? "bg-ink text-white"
                        : "bg-white text-smoke ring-1 ring-line"
                  }`}
                >
                  {i < step ? "✓" : i + 1}
                </span>
                <span
                  className={`hidden text-sm font-semibold sm:block ${
                    i === step ? "text-ink" : "text-smoke"
                  }`}
                >
                  {s}
                </span>
              </div>
              {i < STEPS.length - 1 && (
                <div className="mx-3 h-px flex-1 bg-line" />
              )}
            </div>
          ))}
        </div>
      </div>

      <div className="p-6 sm:p-8">
        <AnimatePresence mode="wait">
          <motion.div
            key={step}
            initial={{ opacity: 0, x: 16 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -16 }}
            transition={{ duration: 0.3 }}
          >
            {step === 0 && (
              <div className="grid gap-5 sm:grid-cols-2">
                <div className="sm:col-span-2">
                  <label className="block">
                    <span className="mb-1.5 block text-sm font-semibold text-ink">
                      Ce dossier d&apos;inscription concerne{" "}
                      <span className="text-orange">*</span>
                    </span>
                    <select
                      value={lienParente}
                      onChange={(e) =>
                        setLienParente(e.target.value as LienParente | "")
                      }
                      className="w-full rounded-xl border border-line bg-paper-2 px-4 py-4 text-ink outline-none transition-colors focus:border-ink/40"
                    >
                      <option value="" disabled>
                        Choisissez…
                      </option>
                      {LIENS_PARENTE.map((l) => (
                        <option key={l} value={l}>
                          {LIEN_LABEL[l]}
                        </option>
                      ))}
                    </select>
                  </label>
                  <p className="mt-1.5 text-xs text-smoke">
                    Saisissez ci-dessous les informations de la personne
                    concernée par ce dossier. L&apos;email reste celui de votre
                    compte.
                  </p>
                </div>
                <Input label="Nom" value={nom} onChange={setNom} required />
                <Input label="Prénom" value={prenom} onChange={setPrenom} required />
                <DatePicker
                  label="Date de naissance"
                  value={dateNaissance}
                  onChange={setDateNaissance}
                  required
                />
                <Input
                  label="Téléphone"
                  type="tel"
                  value={formatPhone(telephone)}
                  onChange={(v) => setTelephone(normalizePhone(v))}
                  placeholder="07 60 83 98 30"
                />
                <div className="sm:col-span-2">
                  <Input
                    label="Email"
                    type="email"
                    value={email}
                    onChange={setEmail}
                    required
                    disabled={!!lockedEmail}
                    error={email.length > 3 && !emailOk ? "Email invalide" : ""}
                  />
                  {lockedEmail && (
                    <p className="mt-1.5 text-xs text-smoke">
                      Email de votre compte — votre dossier y sera rattaché.
                    </p>
                  )}
                </div>
                <div className="sm:col-span-2">
                  <Input label="Adresse" value={adresse} onChange={setAdresse} />
                </div>
                <PostalCityFields
                  codePostal={codePostal}
                  setCodePostal={setCodePostal}
                  ville={ville}
                  setVille={setVille}
                />
                {dateNaissance && (
                  <p className="sm:col-span-2 text-sm text-smoke">
                    Catégorie détectée :{" "}
                    <span className="font-bold text-orange">
                      {tarif.typeAdherent === "jeune" ? "Jeune" : "Adulte"}
                    </span>
                  </p>
                )}
              </div>
            )}

            {step === 1 && (
              <div className="space-y-4">
                {/* Choix de la formule */}
                <div>
                  <p className="mb-1 font-display text-lg font-extrabold uppercase text-ink">
                    Votre formule
                  </p>
                  <p className="mb-3 text-xs text-smoke">
                    Deux orientations, deux tarifs. Choisissez la vôtre.
                  </p>
                  <div className="grid gap-3 sm:grid-cols-2">
                    {PACKAGES.map((p) => {
                      const active = packageType === p.id;
                      return (
                        <button
                          key={p.id}
                          type="button"
                          onClick={() => setPackageType(p.id)}
                          className={`rounded-2xl border-2 p-4 text-left transition-colors ${
                            active
                              ? "border-orange bg-orange-50"
                              : "border-line bg-white hover:border-orange/40"
                          }`}
                        >
                          <div className="flex items-center justify-between">
                            <span className="font-display text-base font-extrabold uppercase text-ink">
                              {p.nom}
                            </span>
                            <span
                              className={`h-5 w-5 shrink-0 rounded-full border-2 ${
                                active ? "border-orange bg-orange" : "border-line"
                              }`}
                            />
                          </div>
                          <p className="mt-1 text-xs text-smoke">{p.accroche}</p>
                          <ul className="mt-3 space-y-1">
                            {p.inclus.slice(0, 3).map((i) => (
                              <li key={i} className="flex gap-1.5 text-xs text-ink">
                                <span className="text-orange">✓</span>
                                {i}
                              </li>
                            ))}
                          </ul>
                          <p className="mt-2 text-[0.7rem] font-semibold uppercase tracking-wide text-orange">
                            {p.orientation}
                          </p>
                        </button>
                      );
                    })}
                  </div>
                </div>

                <Toggle
                  label="Nouveau membre ?"
                  hint="Adhésion de 30€ la première année."
                  value={nouveauMembre}
                  onChange={setNouveauMembre}
                />

                {packageType === "boxe_classique" ? (
                  <Toggle
                    label="Option Préparation Physique"
                    hint="2 séances/semaine (mardi et jeudi 20h) — +100€/an."
                    value={prepa}
                    onChange={setPrepa}
                  />
                ) : (
                  <div className="flex items-center gap-3 rounded-xl border border-orange/20 bg-orange-50 p-4 text-sm text-ink">
                    <span className="text-lg">✓</span>
                    <span>
                      <strong>Préparation Physique incluse</strong> dans le package
                      Savate &amp; Prépa (mardi &amp; jeudi 20h), sans supplément.
                    </span>
                  </div>
                )}

                {tarif.remisePct > 0 && (
                  <p className="text-sm font-semibold text-orange">
                    Ce dossier est le {nbFamille + 1}e membre de votre foyer :
                    −{tarif.remisePct}% appliqués automatiquement sur la cotisation.
                  </p>
                )}
                <LivePrice tarif={tarif} />
              </div>
            )}

            {step === 2 && (
              <div className="space-y-4">
                <p className="text-sm text-smoke">
                  Téléchargez les documents (section au-dessus), remplissez-les,
                  signez-les puis déposez-les ici. Photo d&apos;identité requise.
                </p>
                <FileDrop
                  field="fiche_inscription"
                  adherentId={adherentId}
                  label="Fiche d'inscription signée"
                  hint="PDF, max 5 Mo — glissez ou cliquez"
                  accept={{ "application/pdf": [".pdf"] }}
                  maxSizeMb={5}
                  onChange={onFile}
                />
                <div>
                  <FileDrop
                    field="certificat_medical"
                    adherentId={adherentId}
                    label="Certificat médical signé (facultatif)"
                    hint="PDF, max 5 Mo"
                    accept={{ "application/pdf": [".pdf"] }}
                    maxSizeMb={5}
                    onChange={onFile}
                  />
                  <p className="mt-1.5 text-xs leading-relaxed text-smoke">
                    Vous n&apos;avez pas encore votre certificat médical ? Pas de
                    problème — vous pourrez le déposer depuis votre espace
                    personnel dès que vous l&apos;aurez.
                  </p>
                </div>
                <FileDrop
                  field="reglement"
                  adherentId={adherentId}
                  label="Règlement intérieur signé"
                  hint="PDF, max 5 Mo"
                  accept={{ "application/pdf": [".pdf"] }}
                  maxSizeMb={5}
                  onChange={onFile}
                />
                <FileDrop
                  field="photo"
                  adherentId={adherentId}
                  label="Photo d'identité"
                  hint="JPG ou PNG, max 5 Mo"
                  accept={{ "image/jpeg": [".jpg", ".jpeg"], "image/png": [".png"] }}
                  maxSizeMb={5}
                  onChange={onFile}
                />
              </div>
            )}

            {step === 3 && (
              <div className="space-y-6">
                {/* Récapitulatif du montant (proratisé selon la date) */}
                <div className="rounded-2xl border border-line bg-paper-2 p-5">
                  <div className="flex items-end justify-between gap-3">
                    <span className="font-display text-lg font-extrabold uppercase text-ink">
                      Total à régler
                    </span>
                    <span className="font-display text-3xl font-black text-orange">
                      {euro(devis.total)}
                    </span>
                  </div>
                  <p className="mt-1 text-xs text-smoke">
                    Cotisation {euro(devis.cotisation)}
                    {devis.supplements > 0
                      ? ` + suppléments ${euro(devis.supplements)} (adhésion / prépa)`
                      : ""}
                    .
                  </p>
                  {devis.proratise && (
                    <p className="mt-2 rounded-lg bg-orange-50 px-3 py-2 text-xs font-semibold text-orange">
                      Tarif calculé au prorata des mois restants de la saison.
                    </p>
                  )}
                </div>

                {!plan && (
                  <div>
                    <p className="mb-3 font-display text-lg font-extrabold uppercase text-ink">
                      Mode de règlement
                    </p>
                    <div className="grid gap-2.5 sm:grid-cols-2">
                      {PAYMENTS.filter(
                        (p) =>
                          p.mode === "especes" ||
                          devis.echeancesAutorisees.includes(nbEcheances(p.mode)),
                      ).map((p) => {
                        const active = mode === p.mode;
                        const n = nbEcheances(p.mode);
                        const pl = planEcheances(
                          devis.fractionnable,
                          devis.adhesion,
                          new Date(),
                          n,
                        );
                        return (
                          <button
                            key={p.mode}
                            type="button"
                            onClick={() => {
                              setMode(p.mode);
                              setPlan(null);
                            }}
                            className={`flex items-center justify-between rounded-xl border-2 p-4 text-left transition-colors ${
                              active
                                ? "border-orange bg-orange-50"
                                : "border-line bg-white hover:border-orange/40"
                            }`}
                          >
                            <span className="flex items-center gap-3">
                              <span className="text-xl">{p.icon}</span>
                              <span>
                                <span className="block font-semibold text-ink">
                                  {p.label}
                                </span>
                                {p.mode !== "especes" && (
                                  <span className="text-xs text-smoke">
                                    {n > 1
                                      ? `${euro(pl.premierPrelevement)} aujourd'hui, puis ${n - 1} prélèvement${n - 1 > 1 ? "s" : ""}`
                                      : `${euro(devis.total)} en 1 fois`}
                                  </span>
                                )}
                              </span>
                            </span>
                            <span
                              className={`h-5 w-5 rounded-full border-2 ${
                                active ? "border-orange bg-orange" : "border-line"
                              }`}
                            />
                          </button>
                        );
                      })}
                    </div>

                    {/* Calendrier des prélèvements du mode sélectionné */}
                    {mode &&
                      mode !== "especes" &&
                      nbEcheances(mode) > 1 &&
                      (() => {
                        const pl = planEcheances(
                          devis.fractionnable,
                          devis.adhesion,
                          new Date(),
                          nbEcheances(mode),
                        );
                        return (
                          <div className="mt-4 rounded-xl border border-line bg-white p-4 text-sm">
                            <p className="font-bold text-ink">
                              Calendrier des prélèvements
                            </p>
                            <ul className="mt-2 space-y-1 text-smoke">
                              {pl.dates.map((d, i) => (
                                <li key={d} className="flex justify-between gap-3">
                                  <span>
                                    {i === 0
                                      ? "1er prélèvement : aujourd'hui"
                                      : `${i + 1}ᵉ prélèvement : ${formatDateFr(d)}`}
                                  </span>
                                  <span className="font-semibold text-ink">
                                    {euro(i === 0 ? pl.premierPrelevement : pl.montants[i])}
                                  </span>
                                </li>
                              ))}
                            </ul>
                            {devis.adhesion > 0 && (
                              <p className="mt-2 border-t border-line pt-2 text-xs">
                                L&apos;adhésion ({euro(devis.adhesion)}) est
                                prélevée aujourd&apos;hui (non fractionnée). La
                                prépa physique éventuelle est répartie sur toutes
                                les échéances.
                              </p>
                            )}
                          </div>
                        );
                      })()}
                  </div>
                )}

                {!plan && (
                  <label className="flex cursor-pointer items-start gap-3 rounded-xl border border-line bg-paper-2 p-4">
                    <input
                      type="checkbox"
                      checked={accepteConditions}
                      onChange={(e) => setAccepteConditions(e.target.checked)}
                      className="mt-0.5 h-4 w-4 shrink-0 accent-orange"
                    />
                    <span className="text-sm leading-relaxed text-ink">
                      J&apos;ai lu et j&apos;accepte les conditions d&apos;adhésion
                      et la{" "}
                      <a
                        href="/politique-annulation"
                        target="_blank"
                        rel="noopener noreferrer"
                        className="font-semibold text-orange hover:underline"
                      >
                        politique de non-remboursement
                      </a>
                      . <span className="text-orange">*</span>
                    </span>
                  </label>
                )}

                {plan && (
                  <StripePayment
                    plan={plan}
                    onSuccess={() => router.push("/inscription/merci")}
                  />
                )}
              </div>
            )}
          </motion.div>
        </AnimatePresence>

        {error && (
          <p className="mt-5 rounded-xl bg-red-50 p-3 text-sm font-semibold text-red-700">
            {error}
          </p>
        )}

        {/* Navigation */}
        {!plan && (
          <div className="mt-8 flex items-center justify-between gap-3">
            {step > 0 ? (
              <button
                onClick={prev}
                className="text-sm font-semibold text-smoke transition-colors hover:text-ink"
              >
                ← Retour
              </button>
            ) : (
              <span />
            )}

            {step < 3 && (
              <ButtonAction
                onClick={next}
                size="lg"
                disabled={
                  (step === 0 && !step1Ok) || (step === 2 && !requiredFilesOk)
                }
              >
                Continuer
              </ButtonAction>
            )}

            {step === 3 && mode === "especes" && (
              <ButtonAction
                onClick={submitEspeces}
                size="lg"
                disabled={busy || !accepteConditions}
              >
                {busy ? "Validation…" : "Valider mon inscription"}
              </ButtonAction>
            )}
            {step === 3 && mode && mode !== "especes" && (
              <ButtonAction
                onClick={startStripe}
                size="lg"
                disabled={busy || !accepteConditions}
              >
                {busy ? "Préparation…" : "Procéder au paiement"}
              </ButtonAction>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function Input({
  label,
  value,
  onChange,
  type = "text",
  required,
  error,
  placeholder,
  disabled,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  type?: string;
  required?: boolean;
  error?: string;
  placeholder?: string;
  disabled?: boolean;
}) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-sm font-semibold text-ink">
        {label} {required && <span className="text-orange">*</span>}
      </span>
      <input
        type={type}
        value={value}
        required={required}
        disabled={disabled}
        placeholder={placeholder}
        inputMode={type === "tel" ? "tel" : undefined}
        onChange={(e) => onChange(e.target.value)}
        className={`focus-ring w-full rounded-xl border bg-paper-2 px-4 py-3 text-ink outline-none transition-colors focus:border-orange disabled:cursor-not-allowed disabled:opacity-60 ${
          error ? "border-red-300" : "border-line"
        }`}
      />
      {error && <span className="mt-1 block text-xs font-semibold text-red-600">{error}</span>}
    </label>
  );
}

function LivePrice({
  tarif,
  big,
}: {
  tarif: ReturnType<typeof calculerTarif>;
  big?: boolean;
}) {
  return (
    <div className="rounded-2xl border border-line bg-paper-2 p-5">
      <div className="space-y-2">
        {tarif.lines.map((l) => (
          <div
            key={l.label}
            className="flex items-center justify-between text-sm"
          >
            <span className={l.amount < 0 ? "text-orange" : "text-smoke"}>
              {l.label}
            </span>
            <span
              className={`font-semibold ${
                l.muted ? "text-orange" : l.amount < 0 ? "text-orange" : "text-ink"
              }`}
            >
              {l.muted ? "Inclus" : `${l.amount < 0 ? "−" : ""}${euro(Math.abs(l.amount))}`}
            </span>
          </div>
        ))}
      </div>
      <div className="mt-4 flex items-center justify-between border-t border-line pt-4">
        <span className="font-display text-lg font-extrabold uppercase text-ink">
          Total
        </span>
        <span
          className={`font-display font-black text-orange ${
            big ? "text-4xl" : "text-2xl"
          }`}
        >
          {euro(tarif.total)}
        </span>
      </div>
    </div>
  );
}
