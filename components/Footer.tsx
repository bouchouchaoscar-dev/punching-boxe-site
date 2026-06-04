import Link from "next/link";
import { Logo } from "./ui/Logo";
import { CLUB, NAV_LINKS, SALLES } from "@/lib/constants";

export function Footer() {
  return (
    <footer className="relative overflow-hidden bg-ink text-white">
      <div className="grain absolute inset-0" />
      <div className="container-px relative mx-auto max-w-7xl py-16 sm:py-20">
        <div className="grid gap-12 lg:grid-cols-[1.4fr_1fr_1fr_1.2fr]">
          <div>
            <Logo variant="light" />
            <p className="mt-5 max-w-xs text-sm leading-relaxed text-white/60">
              Club de Boxe Française & Savate au cœur du Val-de-Marne depuis{" "}
              {CLUB.creeEn}. Tous niveaux, dès 5 ans.
            </p>
            <Link
              href="/inscription"
              className="mt-6 inline-flex items-center gap-2 rounded-full bg-orange px-5 py-2.5 text-sm font-semibold text-white transition-transform hover:-translate-y-0.5"
            >
              Séance d&apos;essai gratuite →
            </Link>
          </div>

          <div>
            <h3 className="text-xs font-bold uppercase tracking-[0.2em] text-white/40">
              Navigation
            </h3>
            <ul className="mt-5 space-y-3 text-sm">
              {NAV_LINKS.map((l) => (
                <li key={l.href}>
                  <Link
                    href={l.href}
                    className="text-white/70 transition-colors hover:text-orange"
                  >
                    {l.label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>

          <div>
            <h3 className="text-xs font-bold uppercase tracking-[0.2em] text-white/40">
              Salles
            </h3>
            <ul className="mt-5 space-y-3 text-sm text-white/70">
              {SALLES.map((s) => (
                <li key={s.nom}>
                  <span className="block font-semibold text-white">{s.nom}</span>
                  <span className="text-white/50">{s.ville}</span>
                </li>
              ))}
            </ul>
          </div>

          <div>
            <h3 className="text-xs font-bold uppercase tracking-[0.2em] text-white/40">
              Contact
            </h3>
            <ul className="mt-5 space-y-3 text-sm text-white/70">
              <li>
                <a
                  href={`tel:${CLUB.telephoneHref}`}
                  className="transition-colors hover:text-orange"
                >
                  {CLUB.telephone}
                </a>
              </li>
              <li>
                <a
                  href={`mailto:${CLUB.email}`}
                  className="transition-colors hover:text-orange"
                >
                  {CLUB.email}
                </a>
              </li>
              <li className="text-white/50">{CLUB.adresse}</li>
            </ul>
          </div>
        </div>

        <div className="mt-14 flex flex-col items-center justify-between gap-4 border-t border-white/10 pt-8 text-xs text-white/40 sm:flex-row">
          <p>
            © {new Date().getFullYear()} {CLUB.nom}. Association loi 1901.
          </p>
          <p className="flex items-center gap-2">
            <Link href="/admin/login" className="transition-colors hover:text-white/70">
              Espace admin
            </Link>
            <span>·</span>
            <span>Savate · Boxe Française</span>
          </p>
        </div>
      </div>
    </footer>
  );
}
