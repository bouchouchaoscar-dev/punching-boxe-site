import type { Metadata } from "next";
import { Reveal } from "@/components/ui/Reveal";
import { PageHero } from "@/components/sections/PageHero";
import { CTABanner } from "@/components/sections/CTABanner";
import { Button } from "@/components/ui/Button";
import { EQUIPEMENT, HORAIRES, SALLES } from "@/lib/constants";
import { TARIFS, euro } from "@/lib/pricing";

export const metadata: Metadata = {
  title: "Infos & Tarifs — Cotisations, horaires et salles",
  description:
    "Tarifs 2026-2027 : adhésion 30€, cotisation adulte 430€, jeune 410€, option prépa physique +100€, tarif famille dégressif. Horaires et adresses des 3 salles.",
};

const GRILLE = [
  { label: "Adhésion au club", value: `${euro(TARIFS.adhesion)}`, note: "1ère année uniquement" },
  { label: "Cotisation + licence — Adultes", value: `${euro(TARIFS.cotisationAdulte)}`, note: "Accès Boxe Française + Savate Fitness" },
  { label: "Cotisation + licence — Jeunes", value: `${euro(TARIFS.cotisationJeune)}`, note: "Né(e) après le 01/01/2013" },
  { label: "Option Préparation Physique", value: `+${euro(TARIFS.prepaPhysique)}`, note: "2 séances/semaine, mardi & jeudi 20h" },
];

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

      {/* ---------- Tarifs ---------- */}
      <section className="container-px mx-auto max-w-7xl py-16 sm:py-24">
        <div className="grid gap-12 lg:grid-cols-2 lg:gap-16">
          <Reveal>
            <h2 className="font-display text-3xl font-extrabold uppercase text-ink sm:text-4xl">
              La grille tarifaire
            </h2>
            <div className="mt-7 divide-y divide-line overflow-hidden rounded-[1.5rem] border border-line">
              {GRILLE.map((g) => (
                <div
                  key={g.label}
                  className="flex items-center justify-between gap-4 bg-white p-5"
                >
                  <div>
                    <p className="font-semibold text-ink">{g.label}</p>
                    <p className="text-xs text-smoke">{g.note}</p>
                  </div>
                  <span className="font-display whitespace-nowrap text-2xl font-extrabold text-orange">
                    {g.value}
                  </span>
                </div>
              ))}
            </div>
            <div className="mt-6">
              <Button href="/inscription" size="lg">
                Calculer mon tarif & m&apos;inscrire
              </Button>
            </div>
          </Reveal>

          <Reveal delay={0.1}>
            <h2 className="font-display text-3xl font-extrabold uppercase text-ink sm:text-4xl">
              Tarif famille
            </h2>
            <p className="mt-3 text-smoke">
              À partir de 3 membres d&apos;une même famille inscrits, une réduction
              s&apos;applique <strong>uniquement sur la cotisation</strong> (ni sur
              l&apos;adhésion de 30€, ni sur la prépa physique).
            </p>
            <div className="mt-7 overflow-hidden rounded-[1.5rem] border border-line">
              {FAMILLE.map((f, i) => (
                <div
                  key={f.rang}
                  className={`flex items-center justify-between p-5 ${
                    i % 2 ? "bg-paper-2" : "bg-white"
                  }`}
                >
                  <span className="font-semibold text-ink">{f.rang}</span>
                  <span
                    className={`text-sm font-bold ${
                      f.remise === "Tarif normal" ? "text-smoke" : "text-orange"
                    }`}
                  >
                    {f.remise}
                  </span>
                </div>
              ))}
            </div>
            <div className="mt-6 rounded-2xl border border-orange/20 bg-orange-50 p-5 text-sm text-ink">
              <strong>Exemple :</strong> une famille de 3 adultes paie 430€ pour
              les deux premiers, puis 430€ −10% = 387€ pour le troisième.
            </div>
          </Reveal>
        </div>
      </section>

      {/* ---------- Horaires ---------- */}
      <section className="bg-paper-2 py-16 sm:py-24">
        <div className="container-px mx-auto max-w-7xl">
          <Reveal>
            <span className="eyebrow">Planning</span>
            <h2 className="font-display mt-4 text-3xl font-extrabold uppercase text-ink sm:text-4xl">
              Horaires des cours
            </h2>
            <p className="mt-3 text-smoke">Septembre à fin juin · 10 mois de cours par an.</p>
          </Reveal>

          <Reveal delay={0.1} className="mt-8 overflow-x-auto">
            <table className="w-full min-w-[34rem] border-collapse overflow-hidden rounded-[1.5rem] bg-white text-left">
              <thead>
                <tr className="border-b border-line text-xs uppercase tracking-wide text-smoke">
                  <th className="p-4 font-bold">Jour</th>
                  <th className="p-4 font-bold">Horaire</th>
                  <th className="p-4 font-bold">Cours</th>
                  <th className="p-4 font-bold">Public</th>
                </tr>
              </thead>
              <tbody>
                {HORAIRES.map((h, i) => (
                  <tr key={i} className="border-b border-line last:border-0">
                    <td className="p-4 font-bold text-ink">{h.jour}</td>
                    <td className="p-4 text-smoke">{h.heure}</td>
                    <td className="p-4">
                      <span
                        className={`rounded-full px-2.5 py-1 text-xs font-semibold ${
                          h.cours === "Préparation Physique"
                            ? "bg-ink text-white"
                            : h.cours === "Savate Fitness"
                              ? "bg-orange-50 text-orange"
                              : "bg-orange/10 text-orange"
                        }`}
                      >
                        {h.cours}
                      </span>
                    </td>
                    <td className="p-4 text-sm text-smoke">{h.public}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Reveal>
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
      <section className="bg-ink py-16 text-white sm:py-24">
        <div className="container-px mx-auto max-w-7xl">
          <Reveal>
            <span className="eyebrow text-orange">Nos salles</span>
            <h2 className="font-display mt-4 text-3xl font-extrabold uppercase sm:text-4xl">
              4 salles d&apos;entraînement
            </h2>
          </Reveal>

          <div className="mt-10 grid gap-6 lg:grid-cols-3">
            {SALLES.map((s, i) => (
              <Reveal key={s.nom} delay={i * 0.08}>
                <div className="overflow-hidden rounded-[1.5rem] border border-white/10 bg-ink-soft">
                  <iframe
                    title={`Carte ${s.nom}`}
                    src={s.maps}
                    className="h-48 w-full border-0 grayscale"
                    loading="lazy"
                    referrerPolicy="no-referrer-when-downgrade"
                  />
                  <div className="p-5">
                    <h3 className="font-display text-xl font-extrabold uppercase">
                      {s.nom}
                    </h3>
                    <p className="mt-1 text-sm text-white/60">
                      {s.adresse}
                      {s.detail ? ` · ${s.detail}` : ""}
                    </p>
                    <p className="text-sm text-white/60">{s.ville}</p>
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
