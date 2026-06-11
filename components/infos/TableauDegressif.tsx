"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import {
  COTISATION_PALIERS,
  PREPA_PALIERS,
  TARIFS,
  euro,
  type MoisPalier,
} from "@/lib/pricing";

// Ordre + libellés des mois de la saison (sept → juin).
const ORDRE: MoisPalier[] = ["sept", "oct", "nov", "dec", "jan", "fev", "mars", "avr", "mai", "juin"];
const LABELS: Record<MoisPalier, string> = {
  sept: "Septembre",
  oct: "Octobre",
  nov: "Novembre",
  dec: "Décembre",
  jan: "Janvier",
  fev: "Février",
  mars: "Mars",
  avr: "Avril",
  mai: "Mai",
  juin: "Juin",
};

// Lignes construites DEPUIS lib/pricing.ts (source unique, aucune valeur en dur).
const ROWS = ORDRE.map((k) => ({
  mois: LABELS[k],
  bfA: COTISATION_PALIERS[k].boxe_classique.adulte,
  bfJ: COTISATION_PALIERS[k].boxe_classique.jeune,
  saA: COTISATION_PALIERS[k].savate_prepa.adulte,
  saJ: COTISATION_PALIERS[k].savate_prepa.jeune,
  prepa: PREPA_PALIERS[k],
}));

export function TableauDegressif() {
  const [open, setOpen] = useState(false);

  // Fermeture à l'Échap + verrou du scroll de fond quand la modale est ouverte.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [open]);

  return (
    <>
      <p className="mt-3 text-center text-xs leading-relaxed text-smoke">
        Le tarif est dégressif selon votre mois d&apos;inscription.{" "}
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="font-semibold text-orange hover:underline"
        >
          Voir notre tableau des prix dégressifs →
        </button>
      </p>

      {open && (
        <div
          className="fixed inset-0 z-[80] flex items-center justify-center bg-ink/60 p-3 sm:p-6"
          onClick={() => setOpen(false)}
          role="dialog"
          aria-modal="true"
          aria-label="Tableau des prix dégressifs"
        >
          <div
            className="relative max-h-[92vh] w-full max-w-3xl overflow-y-auto rounded-[1.75rem] bg-paper p-5 shadow-[0_30px_80px_-20px_rgba(0,0,0,0.5)] sm:p-8"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Fermer */}
            <button
              onClick={() => setOpen(false)}
              aria-label="Fermer"
              className="absolute right-4 top-4 text-2xl leading-none text-smoke transition-colors hover:text-ink"
            >
              ×
            </button>

            {/* Logo rond + titre */}
            <div className="flex flex-col items-center text-center">
              <span className="flex h-20 w-20 items-center justify-center rounded-full bg-white shadow-md ring-2 ring-orange/40">
                <Image
                  src="/logo/logo.png"
                  alt="Punching Boxe"
                  width={56}
                  height={56}
                  className="object-contain"
                />
              </span>
              <h2 className="font-display mt-4 text-2xl font-black uppercase text-ink sm:text-3xl">
                Prix dégressifs
              </h2>
              <p className="mt-1 text-sm text-smoke">
                Cotisation annuelle selon votre mois d&apos;inscription
              </p>
            </div>

            {/* ----- Tableau (desktop) ----- */}
            <div className="mt-6 hidden overflow-hidden rounded-2xl border border-line sm:block">
              <table className="w-full text-left text-sm">
                <thead>
                  <tr className="bg-ink text-white">
                    <th className="px-4 py-3 text-xs font-bold uppercase tracking-wide">Mois</th>
                    <th className="px-3 py-3 text-right text-xs font-bold uppercase tracking-wide">BF<br />Adulte</th>
                    <th className="px-3 py-3 text-right text-xs font-bold uppercase tracking-wide">BF<br />Jeune</th>
                    <th className="px-3 py-3 text-right text-xs font-bold uppercase tracking-wide">Savate<br />Adulte</th>
                    <th className="px-3 py-3 text-right text-xs font-bold uppercase tracking-wide">Savate<br />Jeune</th>
                    <th className="px-3 py-3 text-right text-xs font-bold uppercase tracking-wide text-orange">Option<br />prépa</th>
                  </tr>
                </thead>
                <tbody>
                  {ROWS.map((r, i) => (
                    <tr key={r.mois} className={i % 2 === 0 ? "bg-white" : "bg-paper-2"}>
                      <td className="px-4 py-3 font-display font-extrabold uppercase text-ink">{r.mois}</td>
                      <td className="px-3 py-3 text-right font-semibold text-ink">{euro(r.bfA)}</td>
                      <td className="px-3 py-3 text-right font-semibold text-ink">{euro(r.bfJ)}</td>
                      <td className="px-3 py-3 text-right font-semibold text-ink">{euro(r.saA)}</td>
                      <td className="px-3 py-3 text-right font-semibold text-ink">{euro(r.saJ)}</td>
                      <td className="px-3 py-3 text-right font-bold text-orange">+{euro(r.prepa)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* ----- Cartes par mois (mobile) ----- */}
            <div className="mt-6 space-y-3 sm:hidden">
              {ROWS.map((r) => (
                <div key={r.mois} className="rounded-2xl border border-line bg-white p-4">
                  <p className="font-display text-base font-extrabold uppercase text-ink">{r.mois}</p>
                  <div className="mt-3 grid grid-cols-2 gap-x-4 gap-y-3">
                    <MobileCell label="Boxe Française adulte" val={euro(r.bfA)} />
                    <MobileCell label="Boxe Française jeune" val={euro(r.bfJ)} />
                    <MobileCell label="Savate & Prépa adulte" val={euro(r.saA)} />
                    <MobileCell label="Savate & Prépa jeune" val={euro(r.saJ)} />
                  </div>
                  <p className="mt-3 border-t border-line pt-2 text-sm font-bold text-orange">
                    Option prépa : +{euro(r.prepa)}
                  </p>
                </div>
              ))}
            </div>

            {/* Notes */}
            <div className="mt-6 space-y-2 rounded-2xl border border-orange/25 bg-orange-50 p-4 text-sm leading-relaxed text-ink">
              <p>
                <strong className="text-orange">Option prépa</strong> (Boxe
                Française) : accès aux cours de préparation physique et de savate,
                dégressive selon le mois — {euro(PREPA_PALIERS.sept)} de septembre
                à février, {euro(PREPA_PALIERS.mars)} de mars à mai,{" "}
                {euro(PREPA_PALIERS.juin)} en juin. Incluse dans la formule Savate
                &amp; Prépa.
              </p>
              <p>
                En plus de ces montants : <strong>{euro(TARIFS.adhesion)} d&apos;adhésion</strong>{" "}
                la première année (nouveaux membres), et la{" "}
                <strong>remise famille</strong> (3e membre −10 %, 4e −15 %, 5e et
                plus −20 % sur la cotisation).
              </p>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

function MobileCell({ label, val }: { label: string; val: string }) {
  return (
    <div>
      <p className="text-[0.7rem] leading-tight text-smoke">{label}</p>
      <p className="font-display text-lg font-black text-ink">{val}</p>
    </div>
  );
}
