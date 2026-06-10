"use client";

import { useEffect, useMemo, useState } from "react";
import { adminAuthHeaders } from "@/lib/admin-auth";
import { euro } from "@/lib/pricing";
import { saisonCourante } from "@/lib/saison";
import { formatTelephone } from "@/lib/telephone";
import { EnvoiMailModal } from "./EnvoiMailModal";
import { HistoriqueSaisons } from "./HistoriqueSaisons";

type Hist = {
  saison: string;
  disciplines: string[];
  montant: number | null;
  statut: "jeune" | "adulte" | "inconnu";
};
type Ancien = {
  id: string;
  nom: string;
  prenom: string;
  email: string | null;
  telephone: string | null;
  adresse: string | null;
  code_postal: string | null;
  ville: string | null;
  date_naissance: string | null;
  a_verifier: boolean;
  reinscrit: boolean;
  reinscrit_saison: string | null;
  derniere_saison: string | null;
  classe: "saison_derniere" | "tiede" | "froid" | null;
  disciplines: string[];
  nb_saisons: number;
  total_paye: number;
  historique: Hist[];
};


function formatNaissance(d: string | null): string {
  if (!d) return "—";
  const date = new Date(d);
  if (Number.isNaN(date.getTime())) return "—";
  const jj = date.toLocaleDateString("fr-FR");
  let age = new Date().getFullYear() - date.getFullYear();
  const m = new Date().getMonth() - date.getMonth();
  if (m < 0 || (m === 0 && new Date().getDate() < date.getDate())) age--;
  return `${jj} (${age} ans)`;
}
function adresseComplete(a: Ancien): string {
  const l = [a.adresse, [a.code_postal, a.ville].filter(Boolean).join(" ")].filter(Boolean);
  return l.length ? l.join(", ") : "—";
}

const DISC_LABEL: Record<string, string> = {
  BF: "Boxe Française",
  SAVATE: "Savate",
  LES_2: "Les deux",
  AUTRE: "À vérifier",
};
const discLabel = (d: string) => DISC_LABEL[d] ?? d;
const discList = (ds: string[]) => (ds.length ? ds.map(discLabel).join(", ") : "—");

const SEGMENTS: { key: NonNullable<Ancien["classe"]>; label: string }[] = [
  { key: "saison_derniere", label: "Saison dernière" },
  { key: "tiede", label: "Tièdes" },
  { key: "froid", label: "Froids" },
];
const DISCIPLINES: { key: string; label: string }[] = [
  { key: "BF", label: "Boxe Française" },
  { key: "SAVATE", label: "Savate" },
  { key: "LES_2", label: "Les deux" },
];

export function AnciensTable() {
  const [anciens, setAnciens] = useState<Ancien[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [q, setQ] = useState("");
  const [segments, setSegments] = useState<string[]>([]);
  const [disciplines, setDisciplines] = useState<string[]>([]);
  const [openId, setOpenId] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/admin/anciens", { headers: adminAuthHeaders(), cache: "no-store" })
      .then((r) => r.json())
      .then((d) => {
        if (d.error) setError(d.error);
        else setAnciens(d.anciens ?? []);
      })
      .catch(() => setError("Erreur de chargement."))
      .finally(() => setLoading(false));
  }, []);

  const countBySegment = useMemo(() => {
    const c: Record<string, number> = { saison_derniere: 0, tiede: 0, froid: 0 };
    for (const a of anciens) if (a.classe) c[a.classe]++;
    return c;
  }, [anciens]);

  const filtered = useMemo(() => {
    const term = q.trim().toLowerCase();
    return anciens.filter((a) => {
      if (term && !`${a.prenom} ${a.nom}`.toLowerCase().includes(term)) return false;
      if (segments.length && (!a.classe || !segments.includes(a.classe))) return false;
      if (disciplines.length && !disciplines.some((d) => a.disciplines.includes(d)))
        return false;
      return true;
    });
  }, [anciens, q, segments, disciplines]);

  const toggle = (arr: string[], set: (v: string[]) => void, k: string) =>
    set(arr.includes(k) ? arr.filter((x) => x !== k) : [...arr, k]);

  return (
    <div>
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-display text-4xl font-black uppercase text-ink">
            Anciens adhérents
          </h1>
          <p className="mt-1 text-smoke">
            {filtered.length} / {anciens.length} ancien{anciens.length > 1 ? "s" : ""}
          </p>
          <p className="mt-2 max-w-2xl text-sm text-smoke">
            Toute la base d&apos;anciens adhérents importée. Dès qu&apos;un ancien
            se réinscrit via le site, il est reconnu automatiquement et bascule
            dans les adhérents.
          </p>
        </div>
      </div>

      {/* Filtres */}
      <div className="mt-6 space-y-3">
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Rechercher un nom, prénom…"
          className="focus-ring w-full rounded-xl border border-line bg-white px-4 py-2.5 text-sm outline-none focus:border-orange sm:max-w-sm"
        />
        <div className="flex flex-wrap gap-2">
          {SEGMENTS.map((s) => (
            <Chip
              key={s.key}
              active={segments.includes(s.key)}
              onClick={() => toggle(segments, setSegments, s.key)}
            >
              {s.label}{" "}
              <span className="opacity-60">({countBySegment[s.key] ?? 0})</span>
            </Chip>
          ))}
          <span className="mx-1 self-center text-line">|</span>
          {DISCIPLINES.map((d) => (
            <Chip
              key={d.key}
              active={disciplines.includes(d.key)}
              onClick={() => toggle(disciplines, setDisciplines, d.key)}
            >
              {d.label}
            </Chip>
          ))}
          {(segments.length > 0 || disciplines.length > 0) && (
            <button
              onClick={() => { setSegments([]); setDisciplines([]); }}
              className="self-center text-xs font-semibold text-smoke underline-offset-2 hover:underline"
            >
              réinitialiser
            </button>
          )}
        </div>
      </div>

      {error && (
        <div className="mt-6 rounded-xl bg-amber-50 p-4 text-sm text-amber-800">{error}</div>
      )}

      {/* Liste */}
      <div className="mt-6 overflow-hidden rounded-[1.5rem] border border-line bg-white">
        {loading ? (
          <div className="flex h-40 items-center justify-center">
            <span className="h-7 w-7 animate-spin rounded-full border-2 border-ink/20 border-t-orange" />
          </div>
        ) : filtered.length === 0 ? (
          <div className="p-12 text-center text-smoke">Aucun ancien trouvé.</div>
        ) : (
          <ul className="divide-y divide-line">
            {filtered.map((a) => (
              <li key={a.id}>
                <button
                  onClick={() => setOpenId(openId === a.id ? null : a.id)}
                  className="flex w-full items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-paper-2 sm:px-5"
                >
                  <span className="min-w-0 flex-1">
                    <span className="flex flex-wrap items-center gap-2">
                      <span className="font-semibold text-ink">
                        {a.nom} {a.prenom}
                      </span>
                      {a.reinscrit && (
                        <span
                          className="rounded-full bg-green-50 px-2 py-0.5 text-[0.65rem] font-bold uppercase tracking-wide text-green-700"
                          title="Cet ancien s'est réinscrit via le site (dossier adhérent actif)"
                        >
                          ↩️ Réinscrit{a.reinscrit_saison ? ` ${a.reinscrit_saison}` : ""}
                        </span>
                      )}
                      {a.classe && !a.reinscrit && <ClasseBadge classe={a.classe} />}
                      {a.a_verifier && (
                        <span className="rounded-full bg-amber-50 px-2 py-0.5 text-[0.65rem] font-bold uppercase tracking-wide text-amber-700">
                          à vérifier
                        </span>
                      )}
                    </span>
                    <span className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-smoke">
                      <span>Dernière saison : {a.derniere_saison ?? "—"}</span>
                      <span>{discList(a.disciplines)}</span>
                      <span>
                        {a.email ? (
                          a.email
                        ) : (
                          <span className="italic text-smoke/70">pas d&apos;email</span>
                        )}
                      </span>
                    </span>
                  </span>
                  <svg
                    className={`h-4 w-4 shrink-0 text-smoke transition-transform ${openId === a.id ? "rotate-180" : ""}`}
                    viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
                    strokeLinecap="round" strokeLinejoin="round"
                  >
                    <path d="m6 9 6 6 6-6" />
                  </svg>
                </button>

                {openId === a.id && <Fiche a={a} />}
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

function Fiche({ a }: { a: Ancien }) {
  const [mailOpen, setMailOpen] = useState(false);
  return (
    <div className="border-t border-line bg-paper-2 px-4 py-5 sm:px-5">
      <div className="mb-4 flex justify-end">
        <button
          onClick={() => setMailOpen(true)}
          disabled={!a.email}
          title={a.email ? undefined : "Pas d'email"}
          className="rounded-full border border-line bg-white px-4 py-2 text-sm font-bold text-ink transition-colors hover:border-orange hover:text-orange disabled:cursor-not-allowed disabled:opacity-50"
        >
          ✉ Envoyer un mail
        </button>
      </div>
      {mailOpen && (
        <EnvoiMailModal
          cible={{
            type: "ancien",
            id: a.id,
            prenom: a.prenom,
            nom: a.nom,
            email: a.email,
            vars: {
              prenom: a.prenom,
              nom: a.nom,
              saison: saisonCourante(new Date()),
              derniere_saison: a.derniere_saison ?? "",
              disciplines: discList(a.disciplines),
            },
          }}
          onClose={() => setMailOpen(false)}
        />
      )}
      <div className="grid gap-5 lg:grid-cols-[1fr_1.4fr]">
        {/* Coordonnées + dérivés */}
        <div>
          <h3 className="font-display text-sm font-extrabold uppercase text-ink">
            Coordonnées
          </h3>
          <dl className="mt-2 space-y-1.5 text-sm">
            <Line label="Date de naissance" value={formatNaissance(a.date_naissance)} />
            <Line label="Email" value={a.email ?? "—"} />
            <Line label="Téléphone" value={formatTelephone(a.telephone) || "—"} />
            <Line label="Adresse" value={adresseComplete(a)} />
          </dl>
          <h3 className="font-display mt-4 text-sm font-extrabold uppercase text-ink">
            Synthèse
          </h3>
          <dl className="mt-2 space-y-1.5 text-sm">
            <Line label="Saisons fréquentées" value={String(a.nb_saisons)} />
            <Line label="Dernière saison active" value={a.derniere_saison ?? "—"} />
            <Line label="Total cumulé payé" value={euro(a.total_paye)} />
          </dl>
        </div>

        {/* Historique des saisons */}
        <div>
          <h3 className="font-display text-sm font-extrabold uppercase text-ink">
            Historique des saisons
          </h3>
          <HistoriqueSaisons historique={a.historique} />
        </div>
      </div>
    </div>
  );
}

function ClasseBadge({ classe }: { classe: NonNullable<Ancien["classe"]> }) {
  const map = {
    saison_derniere: { label: "Saison dernière", cls: "bg-orange-50 text-orange" },
    tiede: { label: "Tiède", cls: "bg-paper-2 text-ink/70" },
    froid: { label: "Froid", cls: "bg-paper-2 text-smoke" },
  }[classe];
  return (
    <span className={`rounded-full px-2 py-0.5 text-[0.65rem] font-bold uppercase tracking-wide ${map.cls}`}>
      {map.label}
    </span>
  );
}

function Chip({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      className={`rounded-full border px-3 py-1.5 text-xs font-semibold transition-colors ${
        active
          ? "border-orange bg-orange-50 text-orange"
          : "border-line bg-white text-ink hover:border-orange/40"
      }`}
    >
      {children}
    </button>
  );
}

function Line({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <dt className="text-smoke">{label}</dt>
      <dd className="text-right font-semibold text-ink">{value}</dd>
    </div>
  );
}
