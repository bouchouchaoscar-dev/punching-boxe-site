import Link from "next/link";
import { Reveal } from "@/components/ui/Reveal";
import { pageMeta } from "@/lib/seo";
import { PageHero } from "@/components/sections/PageHero";
import { CTABanner } from "@/components/sections/CTABanner";
import { Button } from "@/components/ui/Button";
import { EQUIPEMENT, PACKAGES, SALLES } from "@/lib/constants";
import { TARIFS, euro } from "@/lib/pricing";
import { WeeklyPlanning } from "@/components/infos/WeeklyPlanning";
import { FAQ } from "@/components/infos/FAQ";
import { TableauDegressif } from "@/components/infos/TableauDegressif";

export const metadata = pageMeta({
  title: "Tarifs et Horaires | Punching Boxe Nogent-Le Perreux 2026-2027",
  description:
    "Tarifs et horaires saison 2026-2027 : Boxe Française, Savate, fitness et préparation physique. Cours sur 4 salles à Nogent-sur-Marne et Le Perreux (94). Inscription 100% en ligne.",
  path: "/infos",
  image: "/images/IMG_0574.jpg",
});

const FAMILLE = [
  { rang: "1er et 2ème membre", remise: "Tarif normal" },
  { rang: "3ème membre", remise: "-10% sur la cotisation" },
  { rang: "4ème membre", remise: "-15% sur la cotisation" },
  { rang: "5ème membre", remise: "-20% sur la cotisation" },
];

export default function InfosPage() {
  return (
    <>
      <PageHero
        eyebrow="Infos et Tarifs"
        title={<>Tout, en toute clarté</>}
        intro="Tarifs de la saison 2026-2027, horaires complets, équipement nécessaire et adresses des salles. Aucune surprise, aucun engagement caché."
      />

      {/* ---------- Packages ---------- */}
      <section className="container-px mx-auto max-w-7xl pt-12 pb-16">
        <Reveal>
          <span className="eyebrow">Nos formules</span>
          <h2 className="font-display mt-3 text-3xl font-extrabold uppercase text-ink sm:text-4xl">
            Deux formules au choix
          </h2>
          <p className="mt-3 max-w-2xl text-smoke">
            Boxe Française à {euro(TARIFS.cotisation.boxe_classique.adulte)} /an
            (adulte) ou Savate &amp; Prépa à{" "}
            {euro(TARIFS.cotisation.savate_prepa.adulte)} /an. Licence incluse,
            tarif jeune réduit. + {euro(TARIFS.adhesion)} d&apos;adhésion la
            première année seulement.
          </p>

          <div className="mt-5 max-w-2xl rounded-xl border border-orange/25 bg-white px-4 py-3 text-sm leading-relaxed text-smoke">
            <strong className="font-bold text-orange">
              Vous souhaitez rejoindre le club en cours d&apos;année ?
            </strong>{" "}
            En cours de saison, le tarif est dégressif selon votre mois
            d&apos;inscription. Le montant exact vous sera indiqué automatiquement
            lors de votre inscription en ligne.
          </div>
        </Reveal>

        <div className="mt-10 grid gap-6 lg:grid-cols-2">
          {PACKAGES.map((p, i) => (
            <Reveal key={p.id} delay={i * 0.1}>
              <div
                className={`card-lift flex h-full flex-col rounded-[1.75rem] border p-7 sm:p-8 text-ink ${
                  p.id === "boxe_classique"
                    ? "border-orange/30 bg-[#FFF5EE]"
                    : "border-line bg-white"
                }`}
              >
                <span className="text-xs font-bold uppercase tracking-[0.18em] text-orange">
                  {p.orientation}
                </span>
                <h3 className="font-display mt-3 text-3xl font-black uppercase text-[#111111]">
                  {p.nom}
                </h3>
                <p className="mt-2 text-sm text-smoke">{p.accroche}</p>

                <div className="mt-5 flex items-end gap-2">
                  <span className="font-display text-5xl font-black text-orange">
                    {euro(p.tarifs.adulte)}
                  </span>
                  <span className="mb-1.5 text-sm text-smoke">
                    / an adulte · {euro(p.tarifs.jeune)} jeune
                  </span>
                </div>

                <ul className="mt-6 flex-1 space-y-2.5">
                  {p.inclus.map((it) => (
                    <li key={it} className="flex items-start gap-2.5 text-sm">
                      <span className="mt-0.5 text-orange">✓</span>
                      <span className="text-[#333333]">{it}</span>
                    </li>
                  ))}
                </ul>

                {/* Ajout possible (Boxe Française) : présenté comme une option,
                    distinct des ✓ déjà inclus. Rien pour Savate & Prépa. */}
                {p.option && (
                  <div className="mt-5 flex items-start gap-2.5 text-sm font-semibold text-orange">
                    <span className="mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-orange text-[0.7rem] font-black leading-none text-white">
                      +
                    </span>
                    <span>{p.option}</span>
                  </div>
                )}

                <div className="mt-6">
                  <Button
                    href="/inscription"
                    variant={p.id === "boxe_classique" ? "primary" : "dark"}
                    size="lg"
                    className="w-full"
                  >
                    Choisir {p.nom}
                  </Button>
                </div>
              </div>
            </Reveal>
          ))}
        </div>

        <p className="mt-5 text-center text-xs leading-relaxed text-smoke">
          Adhésion ferme et définitive. Remboursement uniquement sur justificatif
          médical ou déménagement.{" "}
          <Link
            href="/politique-annulation"
            className="font-semibold text-orange hover:underline"
          >
            Voir notre politique d&apos;annulation →
          </Link>
        </p>

        <TableauDegressif />

        {/* Tarif famille */}
        <Reveal className="mt-12">
          <h3 className="font-display text-2xl font-extrabold uppercase text-ink sm:text-3xl">
            Tarif famille
          </h3>
          <p className="mt-3 max-w-2xl text-smoke">
            À partir de 3 membres d&apos;une même famille inscrits, une réduction
            s&apos;applique <strong>uniquement sur la cotisation</strong> (ni sur
            l&apos;adhésion de 30€, ni sur la prépa physique).
          </p>
          <div className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {FAMILLE.map((f) => (
              <div
                key={f.rang}
                className="rounded-2xl border border-line bg-white p-5"
              >
                <p className="font-semibold text-ink">{f.rang}</p>
                <p
                  className={`mt-1 text-sm font-bold ${
                    f.remise === "Tarif normal" ? "text-smoke" : "text-orange"
                  }`}
                >
                  {f.remise}
                </p>
              </div>
            ))}
          </div>
          <div className="mt-6 rounded-2xl border border-orange/20 bg-orange-50 p-5 text-sm text-ink">
            <strong>Exemple :</strong> une famille de 3 adultes paie 430€ pour les
            deux premiers, puis 430€ −10% = 387€ pour le troisième.
          </div>
        </Reveal>
      </section>

      {/* ---------- Horaires ---------- */}
      <section id="planning" className="scroll-mt-24 bg-paper-2 py-16">
        <div className="container-px mx-auto max-w-7xl">
          <Reveal>
            <span className="eyebrow">Planning</span>
            <h2 className="font-display mt-3 text-3xl font-extrabold uppercase text-ink sm:text-4xl">
              La semaine au club
            </h2>
            <p className="mt-3 text-smoke">
              Septembre à fin juin · 10 mois de cours par an.
            </p>
          </Reveal>

          <div className="mt-8">
            <WeeklyPlanning />
          </div>

          {/* Légende */}
          <div className="mt-6 flex flex-wrap gap-x-5 gap-y-2 text-xs font-semibold text-smoke">
            <Legend color="bg-orange-50 ring-1 ring-orange/20" label="Boxe Française — Enfants" />
            <Legend color="bg-orange" label="Boxe Française — Adultes" />
            <Legend style={{ backgroundColor: "#ff9a52" }} label="Savate Fitness" />
            <Legend color="bg-ink" label="Préparation Physique" />
          </div>
        </div>
      </section>

      {/* ---------- Équipement ---------- */}
      <section className="container-px mx-auto max-w-7xl pt-16 pb-8">
        <Reveal>
          <span className="eyebrow">Matériel</span>
          <h2 className="font-display mt-3 text-3xl font-extrabold uppercase text-ink sm:text-4xl">
            Équipement nécessaire
          </h2>
          <p className="mt-3 max-w-2xl text-smoke">
            Pour la séance d&apos;essai, venez simplement en tenue de sport : les
            gants sont prêtés sur place.
          </p>
        </Reveal>

        <div className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {EQUIPEMENT.map((e, i) => (
            <Reveal key={e.item} delay={(i % 4) * 0.06}>
              <div className="h-full rounded-2xl border border-line bg-white p-5">
                <div className="flex h-9 w-9 items-center justify-center rounded-full bg-orange/10 font-display text-sm font-black text-orange">
                  {String(i + 1).padStart(2, "0")}
                </div>
                <h3 className="mt-4 font-bold text-ink">{e.item}</h3>
                <p className="mt-1.5 text-sm leading-relaxed text-smoke">
                  {e.detail}
                </p>
              </div>
            </Reveal>
          ))}
        </div>
      </section>

      {/* ---------- Salles ---------- */}
      <section className="bg-white pt-8 pb-16 text-ink">
        <div className="container-px mx-auto max-w-7xl">
          <Reveal>
            <span className="eyebrow text-orange">Nos salles</span>
            <h2 className="font-display mt-3 text-3xl font-extrabold uppercase text-[#111111] sm:text-4xl">
              4 salles d&apos;entraînement
            </h2>
          </Reveal>

          <div className="mt-10 grid gap-4 md:grid-cols-2 lg:grid-cols-4">
            {SALLES.map((s, i) => (
              <Reveal key={s.nom} delay={i * 0.08}>
                <div className="overflow-hidden rounded-[1.25rem] border border-[#E5E5E5] bg-white shadow-[0_12px_30px_-18px_rgba(0,0,0,0.25)]">
                  <iframe
                    title={`Carte ${s.nom}`}
                    src={s.maps}
                    className="h-[150px] w-full border-0"
                    loading="lazy"
                    referrerPolicy="no-referrer-when-downgrade"
                  />
                  <div className="p-4">
                    <h3 className="font-display text-base font-extrabold uppercase leading-tight text-[#111111]">
                      {s.nom}
                    </h3>
                    <p className="mt-1 text-xs text-[#555555]">
                      {s.adresse}
                      {s.detail ? ` · ${s.detail}` : ""}
                    </p>
                    <p className="text-xs text-[#555555]">{s.ville}</p>
                  </div>
                </div>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      <FAQ />

      <CTABanner />
    </>
  );
}

function Legend({
  color,
  style,
  label,
}: {
  color?: string;
  style?: React.CSSProperties;
  label: string;
}) {
  return (
    <span className="inline-flex items-center gap-2">
      <span className={`h-3 w-3 rounded ${color ?? ""}`} style={style} />
      {label}
    </span>
  );
}
