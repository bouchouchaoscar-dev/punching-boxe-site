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
      { source: "/tarifs", destination: "/infos", statusCode: 301 },
      { source: "/horaires", destination: "/infos", statusCode: 301 },
      { source: "/horaires-club-boxe-nogent", destination: "/infos", statusCode: 301 },
      { source: "/tarifs-inscriptions-club-de-boxe-sur-nogent-le-perreux", destination: "/infos", statusCode: 301 },
      { source: "/adresses-club-boxe-nogent-le-perreux", destination: "/infos", statusCode: 301 },
      { source: "/equipement-et-materiel-de-base-pour-la-boxe-francaise", destination: "/infos", statusCode: 301 },
      { source: "/boxe-francaise", destination: "/activites", statusCode: 301 },
      { source: "/savate-forme-nogent", destination: "/activites", statusCode: 301 },
      { source: "/categories-de-poids-en-savate-boxe-francaise", destination: "/activites", statusCode: 301 },
      { source: "/passage-de-grades-dans-la-boxe-francaise", destination: "/activites", statusCode: 301 },
      { source: "/les-professeurs-de-boxe-du-club-sur-nogent-et-le-perreux", destination: "/equipe", statusCode: 301 },
      { source: "/historique-savate-boxe-francaise", destination: "/a-propos", statusCode: 301 },
      { source: "/contact-club-boxe-nogent-le-perreux", destination: "/contact", statusCode: 301 },
      { source: "/portfolio_page", destination: "/", statusCode: 301 },
    ];
  },
};

export default nextConfig;
