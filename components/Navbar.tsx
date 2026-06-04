"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Lock } from "lucide-react";
import { Logo } from "./ui/Logo";
import { Button } from "./ui/Button";
import { NAV_LINKS } from "@/lib/constants";

export function Navbar() {
  const pathname = usePathname();
  const [scrolled, setScrolled] = useState(false);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 12);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  useEffect(() => setOpen(false), [pathname]);

  useEffect(() => {
    document.body.style.overflow = open ? "hidden" : "";
    return () => {
      document.body.style.overflow = "";
    };
  }, [open]);

  return (
    <header className="fixed inset-x-0 top-0 z-50">
      <div
        className={`transition-all duration-500 ${
          scrolled
            ? "border-b border-line bg-white/80 backdrop-blur-xl"
            : "border-b border-transparent bg-transparent"
        }`}
      >
        <nav className="container-px mx-auto flex h-16 max-w-7xl items-center justify-between sm:h-20">
          <Logo />

          <div className="hidden items-center gap-1 lg:flex">
            {NAV_LINKS.map((l) => {
              const active = pathname === l.href;
              return (
                <Link
                  key={l.href}
                  href={l.href}
                  className={`rounded-full px-4 py-2 text-sm font-semibold transition-colors ${
                    active
                      ? "text-orange"
                      : "text-ink/70 hover:text-ink"
                  }`}
                >
                  {l.label}
                </Link>
              );
            })}
          </div>

          <div className="flex items-center gap-2">
            <Link
              href="/admin/login"
              aria-label="Espace administrateur"
              title="Espace administrateur"
              className="group hidden h-10 w-10 items-center justify-center rounded-full text-ink transition-colors hover:bg-paper-2 sm:flex"
            >
              <Lock
                className="h-4 w-4 opacity-40 transition-opacity group-hover:opacity-100"
                strokeWidth={1.7}
                aria-hidden
              />
            </Link>
            <Button href="/inscription" size="md" className="hidden sm:inline-flex">
              S&apos;inscrire
            </Button>

            <button
              onClick={() => setOpen((v) => !v)}
              aria-label={open ? "Fermer le menu" : "Ouvrir le menu"}
              aria-expanded={open}
              className="flex h-11 w-11 items-center justify-center rounded-full border border-line text-ink lg:hidden"
            >
              <Burger open={open} />
            </button>
          </div>
        </nav>
      </div>

      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 top-16 z-40 bg-white lg:hidden"
          >
            <div className="container-px mx-auto flex flex-col gap-1 py-6">
              {NAV_LINKS.map((l, i) => (
                <motion.div
                  key={l.href}
                  initial={{ opacity: 0, x: -16 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: 0.05 * i }}
                >
                  <Link
                    href={l.href}
                    className={`block border-b border-line py-4 font-display text-3xl font-extrabold uppercase tracking-tight ${
                      pathname === l.href ? "text-orange" : "text-ink"
                    }`}
                  >
                    {l.label}
                  </Link>
                </motion.div>
              ))}
              <div className="mt-6 flex flex-col gap-3">
                <Button href="/inscription" size="lg">
                  S&apos;inscrire en ligne
                </Button>
                <Button href="/admin/login" variant="outline" size="lg">
                  Espace administrateur
                </Button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </header>
  );
}

function Burger({ open }: { open: boolean }) {
  return (
    <div className="relative h-4 w-5">
      <span
        className={`absolute left-0 top-0 h-0.5 w-5 bg-current transition-all duration-300 ${
          open ? "top-1.5 rotate-45" : ""
        }`}
      />
      <span
        className={`absolute left-0 top-1.5 h-0.5 w-5 bg-current transition-all duration-300 ${
          open ? "opacity-0" : ""
        }`}
      />
      <span
        className={`absolute left-0 top-3 h-0.5 w-5 bg-current transition-all duration-300 ${
          open ? "top-1.5 -rotate-45" : ""
        }`}
      />
    </div>
  );
}
