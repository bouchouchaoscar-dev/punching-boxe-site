import type { Metadata } from "next";
import { Reveal } from "@/components/ui/Reveal";
import { PageHero } from "@/components/sections/PageHero";
import { CTABanner } from "@/components/sections/CTABanner";
import { Button } from "@/components/ui/Button";
import { EQUIPEMENT, PACKAGES, SALLES } from "@/lib/constants";
import { TARIFS, euro } from "@/lib/pricing";
import { WeeklyPlanning } from "@/components/infos/WeeklyPlanning";

export const metadata: Metadata = {
  title: "Infos & Tarifs — Nos deux formules, horaires et salles",
  description:
    "Saison 2026-2027 : deux formules à 430€ adulte / 410€ jeune (+30€ adhésion 1ère année). Boxe Classique (option prépa +100€) ou Savate & Forme. Tarif famille dégressif, horaires et 3 salles.",
};

const FAMILLE = [
  { rang: "1er & 2ème membre", remise: "Tarif normal" },
  { rang: "3ème membre", remise: "-10% sur la cotisation" },
  { rang: "4ème membre", remise: "-15% sur la cotisation" },
  { rang: "5ème membre", remise: "-20% sur la cotisation" },
];

export default function InfosPage() {
  return (
    <>
      <PageHero
        eyebrow="Infos & Tarifs"
        title={<>Tout, en toute clarté</>}
        intro="Tarifs de la saison 2026-2027, horaires complets, équipement nécessaire et adresses des salles. Aucune surprise, aucun engagement caché."
      />

      {/* ---------- Packages ---------- */}
      <section className="container-px mx-auto max-w-7xl py-16 sm:py-24">
        <Reveal>
          <span className="eyebrow">Nos formules</span>
          <h2 className="font-display mt-4 text-3xl font-extrabold uppercase text-ink sm:text-4xl">
            Deux formules, un même tarif
          </h2>
          <p className="mt-3 max-w-2xl text-smoke">
            {euro(TARIFS.cotisationAdulte)} / an pour les adultes,{" "}
            {euro(TARIFS.cotisationJeune)} / an pour les jeunes (né·e·s après le
            01/01/2013), licence incluse. + {euro(TARIFS.adhesion)} d&apos;adhésion
            la première année seulement.
          </p>
        </Reveal>

        <div className="mt-10 grid gap-6 lg:grid-cols-2">
          {PACKAGES.map((p, i) => (
            <Reveal key={p.id} delay={i * 0.1}>
              <div
                className={`card-lift flex h-full flex-col rounded-[1.75rem] border p-7 sm:p-8 ${
                  p.id === "boxe_classique"
                    ? "border-ink bg-ink text-white"
                    : "border-line bg-white"
                }`}
              >
                <span
                  className={`text-xs font-bold uppercase tracking-[0.18em] ${
                    p.id === "boxe_classique" ? "text-orange" : "text-orange"
                  }`}
                >
                  {p.orientation}
                </span>
                <h3 className="font-display mt-3 text-3xl font-black uppercase">
                  {p.nom}
                </h3>
                <p
                  className={`mt-2 text-sm ${
                    p.id === "boxe_classique" ? "text-white/70" : "text-smoke"
                  }`}
                >
                  {p.accroche}
                </p>

                <div className="mt-5 flex items-end gap-2">
                  <span className="font-display text-5xl font-black text-orange">
                    {euro(p.tarifs.adulte)}
                  </span>
                  <span
                    className={`mb-1.5 text-sm ${
                      p.id === "boxe_classique" ? "text-white/60" : "text-smoke"
                    }`}
                  >
                    / an adulte · {euro(p.tarifs.jeune)} jeune
                  </span>
                </div>

                <ul className="mt-6 flex-1 space-y-2.5">
                  {p.inclus.map((it) => (
                    <li key={it} className="flex items-start gap-2.5 text-sm">
                      <span className="mt-0.5 text-orange">✓</span>
                      <span
                        className={
                          p.id === "boxe_classique" ? "text-white/90" : "text-ink"
                        }
                      >
                        {it}
                      </span>
                    </li>
                  ))}
                </ul>

                <div
                  className={`mt-5 rounded-xl p-3 text-sm ${
                    p.id === "boxe_classique"
                      ? "bg-white/10 text-white/80"
                      : "bg-orange-50 text-ink"
                  }`}
                >
                  {p.option ?? "Préparation Physique incluse, sans supplément."}
                </div>

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
      <section className="bg-paper-2 py-16 sm:py-24">
        <div className="container-px mx-auto max-w-7xl">
          <Reveal>
            <span className="eyebrow">Planning</span>
            <h2 className="font-display mt-4 text-3xl font-extrabold uppercase text-ink sm:text-4xl">
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
      <section className="container-px mx-auto max-w-7xl py-16 sm:py-24">
        <Reveal>
          <span className="eyebrow">Matériel</span>
          <h2 className="font-display mt-4 text-3xl font-extrabold uppercase text-ink sm:text-4xl">
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
      <section className="bg-white py-16 text-ink sm:py-24">
        <div className="container-px mx-auto max-w-7xl">
          <Reveal>
            <span className="eyebrow text-orange">Nos salles</span>
            <h2 className="font-display mt-4 text-3xl font-extrabold uppercase text-[#111111] sm:text-4xl">
              3 salles d&apos;entraînement
            </h2>
          </Reveal>

          <div className="mt-10 grid gap-6 lg:grid-cols-3">
            {SALLES.map((s, i) => (
              <Reveal key={s.nom} delay={i * 0.08}>
                <div className="overflow-hidden rounded-[1.5rem] border border-[#E5E5E5] bg-white shadow-[0_12px_30px_-18px_rgba(0,0,0,0.25)]">
                  <iframe
                    title={`Carte ${s.nom}`}
                    src={s.maps}
                    className="h-48 w-full border-0"
                    loading="lazy"
                    referrerPolicy="no-referrer-when-downgrade"
                  />
                  <div className="p-5">
                    <h3 className="font-display text-xl font-extrabold uppercase text-[#111111]">
                      {s.nom}
                    </h3>
                    <p className="mt-1 text-sm text-[#555555]">
                      {s.adresse}
                      {s.detail ? ` · ${s.detail}` : ""}
                    </p>
                    <p className="text-sm text-[#555555]">{s.ville}</p>
                  </div>
                </div>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

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
