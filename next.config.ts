import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // @react-pdf/renderer must run as a real Node module on the server,
  // not be processed by the Next.js bundler.
  serverExternalPackages: ["@react-pdf/renderer"],
  images: {
    remotePatterns: [
      // Supabase Storage public buckets (adherent documents / photos)
      { protocol: "https", hostname: "*.supabase.co" },
    ],
  },
  // Redirections 301 depuis l'ancien site WordPress (punching-boxe.com)
  // vers les nouvelles pages → préserve le référencement existant.
  async redirects() {
    return [
      { source: "/tarifs", destination: "/infos", permanent: true },
      { source: "/horaires", destination: "/infos", permanent: true },
      { source: "/horaires-club-boxe-nogent", destination: "/infos", permanent: true },
      { source: "/tarifs-inscriptions-club-de-boxe-sur-nogent-le-perreux", destination: "/infos", permanent: true },
      { source: "/adresses-club-boxe-nogent-le-perreux", destination: "/infos", permanent: true },
      { source: "/equipement-et-materiel-de-base-pour-la-boxe-francaise", destination: "/infos", permanent: true },
      { source: "/boxe-francaise", destination: "/activites", permanent: true },
      { source: "/savate-forme-nogent", destination: "/activites", permanent: true },
      { source: "/categories-de-poids-en-savate-boxe-francaise", destination: "/activites", permanent: true },
      { source: "/passage-de-grades-dans-la-boxe-francaise", destination: "/activites", permanent: true },
      { source: "/les-professeurs-de-boxe-du-club-sur-nogent-et-le-perreux", destination: "/equipe", permanent: true },
      { source: "/historique-savate-boxe-francaise", destination: "/a-propos", permanent: true },
      { source: "/contact-club-boxe-nogent-le-perreux", destination: "/contact", permanent: true },
      { source: "/portfolio_page", destination: "/", permanent: true },
    ];
  },
};

export default nextConfig;
