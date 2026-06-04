import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Désactive le cache persistant Turbopack en dev : sur cet environnement il
  // se corrompt (erreurs LMDB « Another write batch already active » +
  // manifests manquants → 500). Le dev recompile en mémoire, stable.
  experimental: {
    turbopackFileSystemCacheForDev: false,
  },
  // @react-pdf/renderer must run as a real Node module on the server,
  // not be processed by the Next.js bundler.
  serverExternalPackages: ["@react-pdf/renderer"],
  images: {
    remotePatterns: [
      // Supabase Storage public buckets (adherent documents / photos)
      { protocol: "https", hostname: "*.supabase.co" },
    ],
  },
};

export default nextConfig;
