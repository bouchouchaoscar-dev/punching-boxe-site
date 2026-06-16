"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { AnimatePresence, motion } from "framer-motion";
import { Toggle } from "@/components/ui/Toggle";
import { DatePicker } from "@/components/ui/DatePicker";
import { ButtonAction } from "@/components/ui/Button";
import { FileDrop, type FileFieldKey } from "./FileDrop";
import { StripePayment, type StripePlan } from "./StripePayment";
import { PostalCityFields } from "./PostalCityFields";
import { AttestationModal } from "./AttestationModal";
import { formatPhone, normalizePhone } from "@/lib/format";
import {
  calculerTarif,
  deduireType,
  estMineur as calcEstMineur,
  euro,
  formuleLabel,
  nbEcheances,
  prepaDuMois,
  type ModePaiement,
  type PackageType,
} from "@/lib/pricing";
import { SignDocumentModal } from "./SignDocumentModal";
import type { SignatureVect, FicheData, ReglementData } from "@/lib/pdf/types";
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
import { saisonCourante, estJuin, saisonQuiSeTermine } from "@/lib/saison";

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
  const [saisonEnCoursChoisie, setSaisonEnCoursChoisie] = useState(false);
  // Date de référence (simulable en test via ?today=YYYY-MM-DD).
  const [now, setNow] = useState<Date>(() => new Date());
  useEffect(() => {
    const t = new URLSearchParams(window.location.search).get("today");
    if (t) {
      const d = new Date(t);
      if (!Number.isNaN(d.getTime())) setNow(d);
    }
  }, []);
  const saisonAffichee =
    saisonEnCoursChoisie && estJuin(now)
      ? saisonQuiSeTermine(now)
      : saisonCourante(now);
  const [packageType, setPackageType] = useState<PackageType>("boxe_classique");
  // L'adhésion 30€ est décidée par le SERVEUR (ancienneté). true par défaut
  // (affichage prudent) jusqu'à la vérification à l'étape Paiement.
  const [paieAdhesion, setPaieAdhesion] = useState(true);
  // Motif serveur : "ancien_eloigne" = ancien revenu après ≥ 3 ans d'absence
  // (les 30€ sont à nouveau dus) → mention contextuelle dédiée.
  const [ancienneteMotif, setAncienneteMotif] = useState<string | null>(null);
  const [ancienneteLoading, setAncienneteLoading] = useState(false);
  const [prepa, setPrepa] = useState(false);

  const [files, setFiles] = useState<FileState>({
    fiche_inscription: EMPTY_FILE,
    certificat_medical: EMPTY_FILE,
    reglement: EMPTY_FILE,
    photo: EMPTY_FILE,
  });

  // Étape Documents : fiche + règlement remplis/signés EN LIGNE.
  const [contactNom1, setContactNom1] = useState("");
  const [contactTel1, setContactTel1] = useState("");
  const [contactNom2, setContactNom2] = useState("");
  const [contactTel2, setContactTel2] = useState("");
  const [responsable, setResponsable] = useState("");
  const [autorisationMedicale, setAutorisationMedicale] = useState(false);
  // DEUX signatures distinctes : chaque document est vu PUIS signé dans son
  // contexte (modale d'aperçu + signature). On garde aussi l'instant de
  // signature par document (date « Fait le » du PDF concerné).
  const [signatureFiche, setSignatureFiche] = useState<SignatureVect | null>(null);
  const [signatureReglement, setSignatureReglement] =
    useState<SignatureVect | null>(null);
  const [signedAtFiche, setSignedAtFiche] = useState<string | null>(null);
  const [signedAtReglement, setSignedAtReglement] = useState<string | null>(null);
  const [certifFiche, setCertifFiche] = useState(false);
  const [certifReglement, setCertifReglement] = useState(false);
  // Modale de signature ouverte (un document à la fois).
  const [signModal, setSignModal] = useState<null | "fiche" | "reglement">(null);

  const [mode, setMode] = useState<ModePaiement | null>(null);
  const [accepteConditions, setAccepteConditions] = useState(false);
  // Attestation foyer (remise familiale) : modal obligatoire avant validation
  // dès qu'une remise s'applique (3e dossier et +) OU qu'un lien est créé.
  const [attesteFoyer, setAttesteFoyer] = useState(false);
  const [attestOpen, setAttestOpen] = useState(false);
  const pendingAction = useRef<(() => void) | null>(null);
  // Ref : l'attestation est lue à la construction du payload juste après le clic
  // « Je confirme » du modal (évite le state figé du closure).
  const attesteRef = useRef(false);
  // Rattachement famille (comptes séparés) : membres déjà inscrits cités.
  const [rattachOpen, setRattachOpen] = useState(false);
  const [rattachements, setRattachements] = useState<
    { nom: string; prenom: string; date_naissance: string }[]
  >([{ nom: "", prenom: "", date_naissance: "" }]);
  const [rattachInfo, setRattachInfo] = useState<{
    ok: boolean;
    raison: string | null;
    membres: { trouve: boolean; ambigu: boolean; ferme: boolean }[];
    nbMembresActuels: number | null;
    membresNoms?: string[];
  } | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  // Stripe
  const [plan, setPlan] = useState<StripePlan | null>(null);

  // Rattachement famille : aperçu serveur (sans PII) quand des membres sont
  // cités → statut par membre + nombre de membres comptés dans le foyer projeté.
  useEffect(() => {
    if (!token || !rattachOpen) {
      setRattachInfo(null);
      return;
    }
    const remplis = rattachements.filter(
      (r) => r.nom.trim() && r.prenom.trim() && /^\d{4}-\d{2}-\d{2}$/.test(r.date_naissance),
    );
    if (remplis.length === 0) {
      setRattachInfo(null);
      return;
    }
    const ctrl = new AbortController();
    const t = setTimeout(() => {
      fetch("/api/famille/verifier", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ membres: remplis }),
        signal: ctrl.signal,
      })
        .then((r) => r.json())
        .then((d) => setRattachInfo(d))
        .catch(() => {});
    }, 400);
    return () => {
      ctrl.abort();
      clearTimeout(t);
    };
  }, [token, rattachOpen, rattachements]);

  // Décompte effectif du foyer pour l'aperçu de prix : UNIQUEMENT si la case
  // « membre de ma famille déjà inscrit » est cochée ET le rattachement validé
  // par le serveur. Sinon 0 → dossier indépendant, AUCUNE remise (partager un
  // compte ne crée pas de lien familial). Le serveur reste autoritaire.
  const nbFoyerEffectif =
    rattachOpen && rattachInfo?.ok && rattachInfo.nbMembresActuels != null
      ? rattachInfo.nbMembresActuels
      : 0;

  const tarif = useMemo(
    () =>
      calculerTarif(
        {
          dateNaissance,
          packageType,
          nouveauMembre: paieAdhesion,
          optionPrepaPhysique: prepa,
          nbMembresFamille: nbFoyerEffectif,
        },
        now,
        saisonEnCoursChoisie,
      ),
    [dateNaissance, packageType, paieAdhesion, prepa, nbFoyerEffectif, now, saisonEnCoursChoisie],
  );

  // Devis proratisé (selon la date de référence) + échéances autorisées.
  const devis = useMemo(
    () =>
      devisPourAdherent(
        {
          date_naissance: dateNaissance || "2000-01-01",
          package: packageType,
          nouveau_membre: paieAdhesion,
          option_prepa_physique: prepa,
          nb_membres_famille: nbFoyerEffectif,
        },
        now,
        saisonEnCoursChoisie,
      ),
    [dateNaissance, packageType, paieAdhesion, prepa, nbFoyerEffectif, now, saisonEnCoursChoisie],
  );

  // Dès que l'identité est complète et valide, on demande au serveur si
  // l'adhésion 30€ s'applique (selon l'ancienneté), avec un léger debounce.
  // Le bon statut s'affiche donc dès l'étape Options. Re-déclenché si l'identité
  // change. Affichage anticipé seulement : le serveur tranche à la soumission.
  useEffect(() => {
    const identiteOk =
      !!token &&
      !!nom.trim() &&
      !!prenom.trim() &&
      /^\d{4}-\d{2}-\d{2}$/.test(dateNaissance);
    if (!identiteOk) return;
    let annule = false;
    const timer = window.setTimeout(async () => {
      setAncienneteLoading(true);
      try {
        const res = await fetch("/api/inscription/anciennete", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({
            nom,
            prenom,
            date_naissance: dateNaissance,
            saison_en_cours: saisonEnCoursChoisie,
          }),
        });
        const d = await res.json();
        if (!annule && typeof d?.paieAdhesion === "boolean") {
          setPaieAdhesion(d.paieAdhesion);
          setAncienneteMotif(typeof d?.motif === "string" ? d.motif : null);
        }
      } catch {
        /* échec → on garde le défaut prudent (adhésion affichée) */
      } finally {
        if (!annule) setAncienneteLoading(false);
      }
    }, 500);
    return () => {
      annule = true;
      window.clearTimeout(timer);
    };
  }, [token, nom, prenom, dateNaissance, saisonEnCoursChoisie]);

  // fiche/règlement sont GÉNÉRÉS + signés en ligne → leurs URLs viennent de
  // les DONNÉES fiche/règlement (avec signatures) sont envoyées au serveur, qui
  // génère + dépose les PDF AVANT l'insert (1 seul aller-retour, rendu garanti).
  const payload = (): InscriptionPayload => {
    const docs = buildDocsData();
    return {
      nom,
      prenom,
      date_naissance: dateNaissance,
      email,
      telephone,
      adresse,
      ville,
      code_postal: codePostal,
      package: packageType,
      nouveau_membre: paieAdhesion,
      option_prepa_physique: prepa,
      nb_membres_famille: nbFoyerEffectif,
      mode_paiement: mode ?? "especes",
      // Choix explicite garanti par le gating step1Ok (jamais de défaut silencieux).
      lien_parente: lienParente as LienParente,
      saison_en_cours: saisonEnCoursChoisie,
      photo_url: files.photo.url,
      certificat_medical_url: files.certificat_medical.url,
      // Génération serveur : dossier de stockage + données signées.
      adherentId,
      doc_fiche: docs.fiche,
      doc_reglement: docs.reglement,
      rattachements: rattachOpen
        ? rattachements.filter(
            (r) => r.nom.trim() && r.prenom.trim() && r.date_naissance,
          )
        : [],
      attestation_foyer: attesteRef.current,
    };
  };

  // Mineur : déduit de l'âge (né après 2013-01-01) → autorisation parentale.
  // Mineur (< 18 ans) = autorisation parentale requise. INDÉPENDANT du seuil
  // tarif (< 13 ans) : un 13-17 ans paie le tarif adulte mais reste mineur.
  const estMineur = calcEstMineur(dateNaissance);

  // Données de la fiche SANS signature (réutilisées pour l'aperçu en modale ET
  // pour la génération finale, où l'on ajoute la signature + la date).
  function buildFicheData(): FicheData {
    const contacts = [
      { nom: contactNom1.trim(), tel: contactTel1.trim() },
      ...(contactNom2.trim() || contactTel2.trim()
        ? [{ nom: contactNom2.trim(), tel: contactTel2.trim() }]
        : []),
    ];
    return {
      nom,
      prenom,
      dateNaissance,
      telephone,
      email,
      adresse,
      codePostal,
      ville,
      packageType,
      optionPrepa: prepa,
      typeAdherent: deduireType(dateNaissance),
      montantTotal: tarif.total,
      adhesionDue: paieAdhesion,
      mineur: estMineur,
      responsable: estMineur ? responsable.trim() : null,
      autorisationMedicale: estMineur ? autorisationMedicale : undefined,
      contacts,
    };
  }
  function buildReglementData(): ReglementData {
    // Mineur : le responsable légal s'engage et signe (déjà le titulaire).
    return {
      nom,
      prenom,
      mineur: estMineur,
      responsable: estMineur ? responsable.trim() : null,
    };
  }

  // Données fiche/règlement AVEC signatures, envoyées au serveur qui génère +
  // dépose les PDF (rendu garanti avant l'insert, sur le serveur → 1 seul aller-
  // retour). Chaque document porte SA signature et SA date (instant réel capturé
  // dans la modale ; repli sur maintenant si absent).
  function buildDocsData(): { fiche: FicheData; reglement: ReglementData } {
    const now = new Date().toISOString();
    return {
      fiche: {
        ...buildFicheData(),
        signature: signatureFiche,
        dateSignature: signedAtFiche ?? now,
      },
      reglement: {
        ...buildReglementData(),
        signature: signatureReglement,
        dateSignature: signedAtReglement ?? now,
      },
    };
  }

  const emailOk = /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email);
  const step1Ok =
    !!lienParente &&
    nom.trim() &&
    prenom.trim() &&
    dateNaissance &&
    emailOk &&
    // Téléphone + adresse postale désormais obligatoires.
    telephone.trim() &&
    adresse.trim() &&
    codePostal.trim() &&
    ville.trim();
  // Étape Documents : pour passer à la suite il faut la photo, le contact
  // d'urgence (Nom + Tél), l'autorisation parentale si mineur, les DEUX
  // documents signés (fiche + règlement, chacun avec sa case cochée dans la
  // modale). Le certificat médical reste NON bloquant (dépend du médecin,
  // déposable plus tard depuis l'espace).
  const contactUrgenceOk = !!contactNom1.trim() && !!contactTel1.trim();
  const autorisationOk =
    !estMineur || (!!responsable.trim() && autorisationMedicale);
  // Pré-requis pour ouvrir/signer la fiche : elle doit être complète à l'écran
  // (contact d'urgence + autorisation parentale si mineur).
  const infosFicheOk = contactUrgenceOk && autorisationOk;
  const ficheSignee = signatureFiche !== null && certifFiche;
  const reglementSigne = signatureReglement !== null && certifReglement;
  const documentsOk =
    !!files.photo.name && infosFicheOk && ficheSignee && reglementSigne;

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

  // Garde attestation : si une remise familiale s'applique (3e dossier et +) OU
  // si un lien famille est créé (rattachement), on exige l'attestation sur
  // l'honneur via le modal avant de lancer l'action.
  const lienRattachement =
    rattachOpen &&
    rattachements.some(
      (r) => r.nom.trim() && r.prenom.trim() && r.date_naissance,
    );
  function avecAttestation(action: () => void) {
    if ((tarif.remisePct > 0 || lienRattachement) && !attesteFoyer) {
      pendingAction.current = action;
      setAttestOpen(true);
      return;
    }
    action();
  }

  async function submitEspeces() {
    if (!accepteConditions) return;
    setBusy(true);
    setError("");
    try {
      // Le serveur génère + dépose la fiche et le règlement (synchrone, garanti)
      // à partir des données envoyées dans le payload, puis crée le dossier.
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
      router.push(`/inscription/merci?mode=especes&prenom=${encodeURIComponent(prenom)}`);
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
      // Génération serveur des documents incluse dans la création du PaymentIntent
      // (1 seul aller-retour) → le formulaire de carte s'affiche plus vite.
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
      <div className="border-b border-line bg-paper-2 px-6 pt-7 pb-6 sm:px-8 sm:pt-8">
        <div className="mb-6">
          <p className="font-display text-xl font-extrabold uppercase tracking-tight text-orange sm:text-2xl">
            Saison {saisonAffichee}
          </p>
          {estJuin(now) && (
            <p className="mt-2 text-xs text-smoke">
              {saisonEnCoursChoisie ? (
                <>
                  Inscription pour la saison en cours.{" "}
                  <button
                    type="button"
                    onClick={() => setSaisonEnCoursChoisie(false)}
                    className="inline font-semibold text-orange hover:underline"
                  >
                    Revenir à la saison {saisonCourante(now)}
                  </button>
                </>
              ) : (
                <>
                  Inscription pour le mois de juin restant ?{" "}
                  <button
                    type="button"
                    onClick={() => setSaisonEnCoursChoisie(true)}
                    className="inline font-semibold text-orange hover:underline"
                  >
                    Basculer sur {saisonQuiSeTermine(now)}
                  </button>
                </>
              )}
            </p>
          )}
        </div>
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
                      className="w-full appearance-none rounded-xl border border-line bg-paper-2 px-4 py-3 pr-10 text-ink outline-none transition-colors focus:border-ink/40"
                      style={{
                        backgroundImage:
                          "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' fill='none' viewBox='0 0 24 24' stroke='%2399a0aa' stroke-width='2'%3E%3Cpath stroke-linecap='round' stroke-linejoin='round' d='m6 9 6 6 6-6'/%3E%3C/svg%3E\")",
                        backgroundRepeat: "no-repeat",
                        backgroundPosition: "right 0.85rem center",
                        backgroundSize: "1.1rem",
                      }}
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
                  required
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
                  <Input label="Adresse" value={adresse} onChange={setAdresse} required />
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

                {/* Rattachement famille (comptes séparés) — remise dès le 3e membre */}
                <div className="sm:col-span-2 rounded-xl border border-line bg-paper-2 p-4">
                  <label className="flex cursor-pointer items-start gap-3">
                    <input
                      type="checkbox"
                      checked={rattachOpen}
                      onChange={(e) => setRattachOpen(e.target.checked)}
                      className="mt-0.5 h-4 w-4 shrink-0 accent-orange"
                    />
                    <span className="text-sm leading-relaxed text-ink">
                      <strong>Un membre de ma famille est déjà inscrit</strong>
                      <span className="mt-0.5 block text-xs text-smoke">
                        Reliez les inscriptions des membres déjà inscrits (même
                        sur un autre compte) pour bénéficier de la remise
                        familiale, appliquée dès le 3e membre du foyer.
                      </span>
                    </span>
                  </label>

                  {rattachOpen && (
                    <div className="mt-4 space-y-3">
                      {rattachements.map((r, i) => (
                        <div
                          key={i}
                          className="rounded-xl border border-line bg-white p-3"
                        >
                          <div className="flex items-center justify-between">
                            <span className="text-xs font-bold uppercase tracking-wide text-smoke">
                              Membre {i + 1}
                            </span>
                            {rattachements.length > 1 && (
                              <button
                                type="button"
                                onClick={() =>
                                  setRattachements((rs) =>
                                    rs.filter((_, j) => j !== i),
                                  )
                                }
                                className="text-xs font-semibold text-smoke hover:text-red-600"
                              >
                                Retirer
                              </button>
                            )}
                          </div>
                          <div className="mt-2 grid gap-2 sm:grid-cols-3">
                            <input
                              placeholder="Nom"
                              value={r.nom}
                              onChange={(e) =>
                                setRattachements((rs) =>
                                  rs.map((x, j) =>
                                    j === i ? { ...x, nom: e.target.value } : x,
                                  ),
                                )
                              }
                              className="focus-ring rounded-lg border border-line bg-paper-2 px-3 py-2 text-sm outline-none focus:border-orange"
                            />
                            <input
                              placeholder="Prénom"
                              value={r.prenom}
                              onChange={(e) =>
                                setRattachements((rs) =>
                                  rs.map((x, j) =>
                                    j === i ? { ...x, prenom: e.target.value } : x,
                                  ),
                                )
                              }
                              className="focus-ring rounded-lg border border-line bg-paper-2 px-3 py-2 text-sm outline-none focus:border-orange"
                            />
                            <DatePicker
                              value={r.date_naissance}
                              placeholder="Naissance"
                              onChange={(iso) =>
                                setRattachements((rs) =>
                                  rs.map((x, j) =>
                                    j === i
                                      ? { ...x, date_naissance: iso }
                                      : x,
                                  ),
                                )
                              }
                            />
                          </div>
                          {rattachInfo?.membres?.[i] && (
                            <p className="mt-1.5 text-xs font-semibold">
                              {rattachInfo.membres[i].trouve ? (
                                <span className="text-green-600">
                                  ✓ Membre trouvé
                                </span>
                              ) : rattachInfo.membres[i].ferme ? (
                                <span className="text-orange-600">
                                  Cette personne a bien été trouvée, mais son
                                  inscription a été arrêtée (statut : désinscrit).
                                  Elle ne peut pas être comptée dans la remise
                                  familiale.
                                </span>
                              ) : rattachInfo.membres[i].ambigu ? (
                                <span className="text-orange-600">
                                  Plusieurs correspondances, contactez le club
                                </span>
                              ) : (
                                <span className="text-red-600">
                                  Aucun dossier trouvé (cette personne doit
                                  d&apos;abord être inscrite)
                                </span>
                              )}
                            </p>
                          )}
                        </div>
                      ))}
                      <button
                        type="button"
                        onClick={() =>
                          setRattachements((rs) => [
                            ...rs,
                            { nom: "", prenom: "", date_naissance: "" },
                          ])
                        }
                        className="text-sm font-bold text-orange hover:underline"
                      >
                        + Ajouter un membre de ma famille
                      </button>
                      {rattachInfo?.ok &&
                        rattachInfo.nbMembresActuels != null && (
                          <div className="rounded-xl border border-green-500/30 bg-green-50 p-3">
                            <p className="text-xs font-semibold text-green-700">
                              Foyer reconnu : {rattachInfo.nbMembresActuels}{" "}
                              membre{rattachInfo.nbMembresActuels > 1 ? "s" : ""}{" "}
                              déjà compté{rattachInfo.nbMembresActuels > 1 ? "s" : ""}.
                              Ce dossier sera le {rattachInfo.nbMembresActuels + 1}e
                              du foyer.
                            </p>
                            {rattachInfo.membresNoms &&
                              rattachInfo.membresNoms.length > 0 && (
                                <ul className="mt-2 flex flex-wrap gap-1.5">
                                  {rattachInfo.membresNoms.map((n) => (
                                    <li
                                      key={n}
                                      className="inline-flex items-center gap-1 rounded-full bg-white px-2.5 py-1 text-xs font-semibold text-ink"
                                    >
                                      <span className="text-green-600">✓</span>
                                      {n}
                                    </li>
                                  ))}
                                </ul>
                              )}
                            <p className="mt-2 text-xs text-smoke">
                              Vérifiez qu&apos;il s&apos;agit bien des membres de
                              votre foyer. Vous confirmerez avant le paiement.
                            </p>
                          </div>
                        )}
                    </div>
                  )}
                </div>
              </div>
            )}

            {step === 1 && (
              <div className="space-y-4">
                {/* Choix de la formule */}
                <div>
                  <p className="mb-1 font-display text-lg font-extrabold uppercase text-ink">
                    Votre formule
                  </p>
                  <p className="mb-1 text-xs text-smoke">
                    Deux orientations, deux tarifs. Choisissez la vôtre.
                  </p>
                  <p className="mb-3 text-xs font-semibold text-orange">
                    Tarif jeune : moins de 13 ans.
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

                {/* L'adhésion 30€ n'est plus déclarée par l'adhérent : le serveur
                    la décide selon l'ancienneté (cf. récap à l'étape Paiement). */}

                {packageType === "boxe_classique" ? (
                  <Toggle
                    label="Inclure la préparation physique et la savate"
                    hint={`Accès aux cours de prépa physique et de savate, 2 séances/semaine (mardi et jeudi 20h). +${prepaDuMois(now, saisonEnCoursChoisie)}€ (dégressif selon le mois d'inscription).`}
                    value={prepa}
                    onChange={setPrepa}
                  />
                ) : (
                  <div className="flex items-center gap-3 rounded-xl border border-orange/20 bg-orange-50 p-4 text-sm text-ink">
                    <span className="text-lg">✓</span>
                    <span>
                      <strong>Préparation Physique et savate incluses</strong> dans
                      la formule Savate &amp; Prépa (mardi &amp; jeudi 20h), sans
                      supplément.
                    </span>
                  </div>
                )}

                {tarif.remisePct > 0 && (
                  <p className="text-sm font-semibold text-orange">
                    Ce dossier est le {nbFoyerEffectif + 1}e membre du foyer
                    rattaché : −{tarif.remisePct}% sur la cotisation.
                  </p>
                )}
                <LivePrice
                  tarif={tarif}
                  paieAdhesion={paieAdhesion}
                  adhesionMotif={ancienneteMotif}
                  loading={ancienneteLoading}
                />
              </div>
            )}

            {step === 2 && (
              <div className="space-y-6">
                {/* Récap pré-rempli : la fiche et le règlement sont générés à partir
                    de ces infos, remplis et signés en ligne (plus d'impression). */}
                <div className="rounded-2xl border border-line bg-paper-2 p-4">
                  <p className="text-sm font-semibold text-ink">
                    Vos informations (déjà saisies)
                  </p>
                  <div className="mt-2 grid gap-1.5 text-sm text-smoke sm:grid-cols-2">
                    <span><strong className="text-ink">Nom :</strong> {nom} {prenom}</span>
                    <span><strong className="text-ink">Né(e) le :</strong> {dateNaissance || "—"}</span>
                    <span><strong className="text-ink">Email :</strong> {email}</span>
                    <span><strong className="text-ink">Tél :</strong> {telephone ? formatPhone(telephone) : "—"}</span>
                    <span className="sm:col-span-2"><strong className="text-ink">Adresse :</strong> {adresse}, {codePostal} {ville}</span>
                    <span className="sm:col-span-2"><strong className="text-ink">Formule :</strong> {formuleLabel(packageType, prepa)}</span>
                  </div>
                  <p className="mt-2 text-xs leading-relaxed text-smoke">
                    Votre fiche d&apos;inscription et le règlement intérieur seront
                    <strong> remplis et signés en ligne</strong> à partir de ces
                    informations, puis ajoutés automatiquement à votre dossier.
                  </p>
                </div>

                {/* Contact d'urgence (obligatoire) */}
                <div>
                  <h3 className="text-sm font-semibold text-ink">
                    Personne à prévenir en cas d&apos;accident{" "}
                    <span className="text-orange">*</span>
                  </h3>
                  <div className="mt-3 grid gap-3 sm:grid-cols-2">
                    <Input label="Prénom et nom" value={contactNom1} onChange={setContactNom1} required />
                    <Input
                      label="Téléphone"
                      type="tel"
                      value={formatPhone(contactTel1)}
                      onChange={(v) => setContactTel1(normalizePhone(v))}
                      placeholder="06 12 34 56 78"
                      required
                    />
                  </div>
                  <p className="mt-3 text-xs font-semibold text-smoke">
                    Contact secondaire (facultatif)
                  </p>
                  <div className="mt-1.5 grid gap-3 sm:grid-cols-2">
                    <Input label="Prénom et nom" value={contactNom2} onChange={setContactNom2} />
                    <Input
                      label="Téléphone"
                      type="tel"
                      value={formatPhone(contactTel2)}
                      onChange={(v) => setContactTel2(normalizePhone(v))}
                    />
                  </div>
                </div>

                {/* Autorisation parentale (mineur) */}
                {estMineur && (
                  <div className="rounded-2xl border border-orange/25 bg-orange-50 p-4">
                    <h3 className="text-sm font-semibold text-ink">
                      Adhérent mineur — autorisation parentale{" "}
                      <span className="text-orange">*</span>
                    </h3>
                    <div className="mt-3">
                      <Input
                        label="Responsable légal (nom et prénom)"
                        value={responsable}
                        onChange={setResponsable}
                        required
                      />
                    </div>
                    <label className="mt-3 flex cursor-pointer items-start gap-3">
                      <input
                        type="checkbox"
                        checked={autorisationMedicale}
                        onChange={(e) => setAutorisationMedicale(e.target.checked)}
                        className="mt-0.5 h-4 w-4 shrink-0 accent-orange"
                      />
                      <span className="text-sm leading-relaxed text-ink">
                        Je soussigné(e){" "}
                        <strong>{responsable.trim() || "[responsable légal]"}</strong>{" "}
                        autorise mon enfant{" "}
                        <strong>
                          {`${prenom} ${nom}`.trim() || "[prénom et nom de l'enfant]"}
                        </strong>{" "}
                        à participer aux activités et entraînements du club
                        Punching Boxe. <span className="text-orange">*</span>
                      </span>
                    </label>
                  </div>
                )}

                {/* Documents à signer : on VOIT le document rempli, on le
                    vérifie, PUIS on le signe dans son contexte (modale). */}
                <div>
                  <h3 className="text-sm font-semibold text-ink">
                    Vos documents à signer <span className="text-orange">*</span>
                  </h3>
                  <p className="mt-1 text-xs text-smoke">
                    Ouvrez chaque document : vérifiez vos informations, puis signez
                    directement en bas (au doigt ou à la souris).
                  </p>
                  <div className="mt-3 space-y-3">
                    <DocCard
                      label="Fiche d'inscription"
                      desc="Pré-remplie avec vos informations. À vérifier puis signer."
                      done={ficheSignee}
                      disabled={!infosFicheOk}
                      disabledHint="Renseignez d'abord le contact d'urgence ci-dessus."
                      ctaSign="Voir et signer ma fiche"
                      onClick={() => setSignModal("fiche")}
                    />
                    <DocCard
                      label="Règlement intérieur"
                      desc="À lire et accepter."
                      done={reglementSigne}
                      ctaSign="Lire et signer le règlement"
                      onClick={() => setSignModal("reglement")}
                    />
                  </div>
                </div>

                {/* Pièces à fournir */}
                <div>
                  <h3 className="text-sm font-semibold text-ink">
                    Vos pièces à fournir
                  </h3>
                  <div className="mt-3 space-y-5">
                    {/* Photo d'identité : recadrage */}
                    <FileDrop
                      field="photo"
                      adherentId={adherentId}
                      label="Photo d'identité"
                      hint="JPG ou PNG, max 5 Mo"
                      accept={{
                        "image/jpeg": [".jpg", ".jpeg"],
                        "image/png": [".png"],
                      }}
                      maxSizeMb={5}
                      onChange={onFile}
                    />

                    {/* Certificat médical : upload (non bloquant) */}
                    <div>
                      <FileDrop
                        field="certificat_medical"
                        adherentId={adherentId}
                        label="Certificat médical"
                        hint="PDF, max 5 Mo"
                        accept={{ "application/pdf": [".pdf"] }}
                        maxSizeMb={5}
                        onChange={onFile}
                      />
                      <p className="mt-1.5 text-xs leading-relaxed text-smoke">
                        À faire établir par votre médecin, puis à déposer ici. Non
                        bloquant pour finaliser votre inscription, mais obligatoire
                        et à fournir dans les meilleurs délais (déposable plus tard
                        depuis votre espace).
                      </p>
                    </div>
                  </div>
                </div>
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
                  {/* Décision adhésion (serveur) : statut affiché, jamais saisi. */}
                  {ancienneteLoading ? (
                    <p className="mt-2 text-xs text-smoke">Calcul de votre tarif…</p>
                  ) : paieAdhesion ? (
                    <>
                      <p className="mt-2 text-xs text-smoke">
                        Adhésion au club incluse&nbsp;: {euro(30)}.
                      </p>
                      {ancienneteMotif === "ancien_eloigne" && (
                        <p className="mt-1 text-xs leading-relaxed text-smoke">
                          Vous avez déjà été inscrit au club par le passé. Après 3
                          années consécutives d&apos;absence ou plus, les frais
                          d&apos;adhésion de {euro(30)} sont à nouveau dus.
                        </p>
                      )}
                    </>
                  ) : (
                    <p className="mt-2 text-xs text-smoke">
                      Membre déjà connu du club&nbsp;: pas d&apos;adhésion cette saison.
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
                          now,
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
                          now,
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
                    onSuccess={() => router.push(`/inscription/merci?prenom=${encodeURIComponent(prenom)}`)}
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
                  (step === 0 && !step1Ok) || (step === 2 && !documentsOk)
                }
              >
                Continuer
              </ButtonAction>
            )}

            {step === 3 && mode === "especes" && (
              <ButtonAction
                onClick={() => avecAttestation(submitEspeces)}
                size="lg"
                disabled={busy || !accepteConditions}
              >
                {busy
                  ? "Finalisation de votre inscription…"
                  : "Valider mon inscription"}
              </ButtonAction>
            )}
            {step === 3 && mode && mode !== "especes" && (
              <ButtonAction
                onClick={() => avecAttestation(startStripe)}
                size="lg"
                disabled={busy || !accepteConditions}
              >
                {busy
                  ? "Préparation du paiement sécurisé…"
                  : "Procéder au paiement"}
              </ButtonAction>
            )}
          </div>
        )}
      </div>

      {attestOpen && (
        <AttestationModal
          message={
            tarif.remisePct > 0
              ? `Ce dossier bénéficie d'une remise familiale de −${tarif.remisePct} % (${nbFoyerEffectif + 1}e membre${nbFoyerEffectif + 1 >= 5 ? " et plus" : ""} du foyer). En continuant, vous attestez que cette personne appartient à votre foyer familial.`
              : `Vous ajoutez un membre de votre foyer. Ce lien sera pris en compte pour vos prochaines inscriptions : la remise familiale s'applique à partir du 3e membre. En continuant, vous attestez que cette personne appartient à votre foyer familial.`
          }
          onConfirm={() => {
            attesteRef.current = true;
            setAttesteFoyer(true);
            setAttestOpen(false);
            const a = pendingAction.current;
            pendingAction.current = null;
            a?.();
          }}
          onCancel={() => {
            setAttestOpen(false);
            pendingAction.current = null;
          }}
        />
      )}

      {/* Modales de signature : on voit le document rempli, puis on le signe. */}
      {signModal === "fiche" && (
        <SignDocumentModal
          title="Fiche d'inscription"
          payload={{ doc: "fiche", fiche: buildFicheData() }}
          certifLabel={
            <>
              Je certifie l&apos;exactitude des informations de ma{" "}
              <strong>fiche d&apos;inscription</strong>.
            </>
          }
          initialSignature={signatureFiche}
          initialChecked={certifFiche}
          onClose={() => setSignModal(null)}
          onConfirm={(sig, at) => {
            setSignatureFiche(sig);
            setSignedAtFiche(at);
            setCertifFiche(true);
            setSignModal(null);
          }}
        />
      )}
      {signModal === "reglement" && (
        <SignDocumentModal
          title="Règlement intérieur"
          payload={{ doc: "reglement", reglement: buildReglementData() }}
          certifLabel={
            estMineur ? (
              <>
                Je soussigné(e){" "}
                <strong>{responsable.trim() || "[responsable légal]"}</strong>,
                représentant légal de{" "}
                <strong>
                  {prenom} {nom}
                </strong>
                , certifie avoir pris connaissance du règlement intérieur et
                m&apos;engage à le faire respecter.
              </>
            ) : (
              <>
                Je soussigné(e){" "}
                <strong>
                  {prenom} {nom}
                </strong>{" "}
                certifie avoir pris connaissance du règlement intérieur et
                l&apos;accepter sans réserve.
              </>
            )
          }
          initialSignature={signatureReglement}
          initialChecked={certifReglement}
          onClose={() => setSignModal(null)}
          onConfirm={(sig, at) => {
            setSignatureReglement(sig);
            setSignedAtReglement(at);
            setCertifReglement(true);
            setSignModal(null);
          }}
        />
      )}
    </div>
  );
}

// Carte d'un document à signer : état (à signer / signé ✓) + bouton qui ouvre
// la modale d'aperçu + signature. Désactivable (ex. fiche tant que le contact
// d'urgence n'est pas renseigné).
function DocCard({
  label,
  desc,
  done,
  disabled,
  disabledHint,
  ctaSign,
  onClick,
}: {
  label: string;
  desc: string;
  done: boolean;
  disabled?: boolean;
  disabledHint?: string;
  ctaSign: string;
  onClick: () => void;
}) {
  return (
    <div
      className={`flex flex-col gap-3 rounded-xl border p-4 sm:flex-row sm:items-center sm:justify-between ${
        done ? "border-green-500/40 bg-green-50" : "border-line bg-paper-2"
      }`}
    >
      <div className="min-w-0">
        <p className="flex items-center gap-2 text-sm font-semibold text-ink">
          {done && <span className="text-green-600">✓</span>}
          {label}
        </p>
        <p className="mt-0.5 text-xs text-smoke">
          {done ? "Signé ✓" : desc}
        </p>
        {disabled && disabledHint && (
          <p className="mt-1 text-xs font-semibold text-orange">{disabledHint}</p>
        )}
      </div>
      <button
        type="button"
        onClick={onClick}
        disabled={disabled}
        className={`shrink-0 whitespace-nowrap rounded-full px-4 py-2.5 text-sm font-bold transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${
          done
            ? "border border-line bg-white text-ink hover:bg-paper-2"
            : "bg-orange text-white hover:bg-orange/90"
        }`}
      >
        {done ? "Revoir / re-signer" : ctaSign}
      </button>
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
  paieAdhesion,
  adhesionMotif,
  loading,
}: {
  tarif: ReturnType<typeof calculerTarif>;
  big?: boolean;
  paieAdhesion?: boolean;
  adhesionMotif?: string | null;
  loading?: boolean;
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
        {/* Statut d'adhésion (décidé serveur) : calcul en cours, ou mention
            rassurante pour un ancien reconnu, là où la ligne 30€ apparaîtrait. */}
        {loading ? (
          <p className="text-xs italic text-smoke">Calcul de votre tarif…</p>
        ) : paieAdhesion === false ? (
          <div className="flex items-center justify-between rounded-lg bg-green-50 px-3 py-2 text-xs font-semibold text-green-700">
            <span>Membre déjà connu du club</span>
            <span>adhésion non due</span>
          </div>
        ) : adhesionMotif === "ancien_eloigne" ? (
          <p className="text-xs leading-relaxed text-smoke">
            Vous avez déjà été inscrit au club par le passé. Après 3 années
            consécutives d&apos;absence ou plus, les frais d&apos;adhésion de{" "}
            {euro(30)} sont à nouveau dus.
          </p>
        ) : null}
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
      {tarif.cotisationProratisee < tarif.cotisationBase && (
        <p className="mt-3 text-xs leading-relaxed text-smoke">
          Tarif calculé automatiquement selon votre mois d&apos;inscription
          (dégressivité appliquée en cours de saison).
        </p>
      )}
    </div>
  );
}
