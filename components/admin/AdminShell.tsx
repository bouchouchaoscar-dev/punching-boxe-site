"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useState } from "react";
import { Logo } from "@/components/ui/Logo";
import { setAdminSession } from "@/lib/admin-auth";

const NAV = [
  { href: "/admin", label: "Tableau de bord", icon: "grid" },
  { href: "/admin/adherents", label: "Adhérents", icon: "users" },
  { href: "/admin/campagnes", label: "Campagnes", icon: "mail" },
];

export function AdminShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const [open, setOpen] = useState(false);

  function logout() {
    setAdminSession(false);
    router.replace("/admin/login");
  }

  return (
    <div className="min-h-screen bg-paper-2 lg:flex">
      {/* Sidebar */}
      <aside
        className={`fixed inset-y-0 left-0 z-40 w-64 transform border-r border-line bg-white transition-transform lg:static lg:translate-x-0 ${
          open ? "translate-x-0" : "-translate-x-full"
        }`}
      >
        <div className="flex items-center border-b border-line px-5 pb-5 pt-6">
          <Logo />
        </div>
        <nav className="space-y-1 p-4">
          {NAV.map((n) => {
            const active =
              n.href === "/admin"
                ? pathname === "/admin"
                : pathname.startsWith(n.href);
            return (
              <Link
                key={n.href}
                href={n.href}
                onClick={() => setOpen(false)}
                className={`flex items-center gap-3 rounded-xl px-4 py-2.5 text-sm font-semibold transition-colors ${
                  active
                    ? "bg-ink text-white"
                    : "text-ink/70 hover:bg-paper-2"
                }`}
              >
                <Icon name={n.icon} />
                {n.label}
              </Link>
            );
          })}
        </nav>
        <div className="absolute inset-x-0 bottom-0 border-t border-line p-3">
          <button
            onClick={logout}
            className="flex w-full items-center gap-3 rounded-xl px-4 py-2.5 text-sm font-semibold text-ink/70 transition-colors hover:bg-paper-2"
          >
            <Icon name="logout" />
            Déconnexion
          </button>
          <Link
            href="/"
            className="mt-1 block px-4 py-2 text-xs text-smoke hover:text-ink"
          >
            ← Retour au site
          </Link>
        </div>
      </aside>

      {open && (
        <div
          className="fixed inset-0 z-30 bg-ink/30 lg:hidden"
          onClick={() => setOpen(false)}
        />
      )}

      {/* Main */}
      <div className="flex-1">
        <header className="sticky top-0 z-20 flex h-16 items-center justify-between border-b border-line bg-white/80 px-5 backdrop-blur lg:hidden">
          <Logo />
          <button
            onClick={() => setOpen(true)}
            aria-label="Menu"
            className="flex h-10 w-10 items-center justify-center rounded-lg border border-line"
          >
            <Icon name="grid" />
          </button>
        </header>
        <main className="container-px mx-auto max-w-6xl py-8 sm:py-10">
          {children}
        </main>
      </div>
    </div>
  );
}

function Icon({ name }: { name: string }) {
  const common = { className: "h-5 w-5", fill: "none", viewBox: "0 0 24 24" };
  if (name === "users")
    return (
      <svg {...common}>
        <path d="M16 19v-1a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v1M22 19v-1a4 4 0 0 0-3-3.87M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM16 3.13a4 4 0 0 1 0 7.75" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    );
  if (name === "logout")
    return (
      <svg {...common}>
        <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    );
  if (name === "mail")
    return (
      <svg {...common}>
        <path d="M4 4h16a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2z" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
        <path d="m22 6-10 7L2 6" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    );
  return (
    <svg {...common}>
      <path d="M3 3h7v7H3zM14 3h7v7h-7zM14 14h7v7h-7zM3 14h7v7H3z" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
