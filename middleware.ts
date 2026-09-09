import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

// Gating des PAGES /admin par rôle — DÉFENSE EN PROFONDEUR, pas le contrôle
// primaire. Le cookie de rôle est NON SECRET (posé côté client au login) : un
// coach qui le trafique en « admin » ne verra AUCUNE donnée, car chaque
// endpoint /api/admin/* refuse un Bearer ≠ mot de passe admin (isAdminRequest).
// Ici on se contente de rediriger un coach vers son unique page autorisée pour
// éviter d'afficher des coquilles de pages qui ne se rempliront pas.
const ROLE_COOKIE = "pbnp_role";

// Un coach ne peut voir que le trombinoscope (et la page de login).
function coachAutorise(pathname: string): boolean {
  return (
    pathname === "/admin/login" || pathname.startsWith("/admin/trombinoscope")
  );
}

export function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;
  if (!pathname.startsWith("/admin")) return NextResponse.next();

  const role = req.cookies.get(ROLE_COOKIE)?.value;
  if (role === "coach" && !coachAutorise(pathname)) {
    const url = req.nextUrl.clone();
    url.pathname = "/admin/trombinoscope";
    return NextResponse.redirect(url);
  }
  return NextResponse.next();
}

// Ne matche QUE les pages /admin — jamais les routes /api (protégées, elles,
// par leur propre vérification de rôle serveur).
export const config = {
  matcher: ["/admin", "/admin/:path*"],
};
