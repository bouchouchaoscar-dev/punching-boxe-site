import Link from "next/link";
import { Logo } from "./ui/Logo";
import { CLUB, NAV_LINKS, SALLES } from "@/lib/constants";

export function Footer() {
  return (
    <footer className="relative border-t border-[#E5E5E5] bg-white text-[#333333]">
      <div className="container-px relative mx-auto max-w-7xl py-16 sm:py-20">
        <div className="grid gap-12 lg:grid-cols-[1.4fr_1fr_1fr_1.2fr]">
          <div>
            <Logo variant="dark" gapClassName="gap-5" />
            <p className="mt-5 max-w-xs text-sm leading-relaxed text-[#555555]">
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
            <h3 className="text-xs font-bold uppercase tracking-[0.2em] text-[#111111]">
              Navigation
            </h3>
            <ul className="mt-5 space-y-3 text-sm">
              {NAV_LINKS.map((l) => (
                <li key={l.href}>
                  <Link
                    href={l.href}
                    className="text-[#333333] transition-colors hover:text-orange"
                  >
                    {l.label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>

          <div>
            <h3 className="text-xs font-bold uppercase tracking-[0.2em] text-[#111111]">
              Salles
            </h3>
            <ul className="mt-5 space-y-3 text-sm text-[#333333]">
              {SALLES.map((s) => (
                <li key={s.nom}>
                  <span className="block font-semibold text-[#111111]">
                    {s.nom}
                  </span>
                  <span className="text-[#777777]">{s.ville}</span>
                </li>
              ))}
            </ul>
          </div>

          <div>
            <h3 className="text-xs font-bold uppercase tracking-[0.2em] text-[#111111]">
              Contact
            </h3>
            <ul className="mt-5 space-y-3 text-sm text-[#333333]">
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
              <li className="text-[#555555]">
                <span className="block">19 bis rue Paul Bert</span>
                <span className="block">
                  94130 <span className="whitespace-nowrap">Nogent-sur-Marne</span>
                </span>
              </li>
            </ul>
          </div>
        </div>

        <div className="mt-14 flex flex-col items-center justify-between gap-4 border-t border-[#E5E5E5] pt-8 text-xs text-[#888888] sm:flex-row">
          <p>
            © {new Date().getFullYear()} {CLUB.nom}. Association loi 1901.
          </p>
          <p className="flex items-center gap-2">
            <Link
              href="/admin/login"
              className="transition-colors hover:text-orange"
            >
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
