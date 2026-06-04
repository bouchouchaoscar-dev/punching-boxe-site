import type { Metadata } from "next";
import { Archivo, Manrope } from "next/font/google";
import "./globals.css";
import { CLUB, SITE_URL } from "@/lib/constants";

const archivo = Archivo({
  variable: "--font-archivo",
  subsets: ["latin"],
  weight: ["600", "700", "800", "900"],
  display: "swap",
});

const manrope = Manrope({
  variable: "--font-manrope",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700", "800"],
  display: "swap",
});

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: {
    default:
      "Punching Boxe Nogent-Le Perreux — Club de Boxe Française & Savate",
    template: "%s · Punching Boxe Nogent-Le Perreux",
  },
  description:
    "Club de Boxe Française (Savate) et Savate Fitness à Nogent-sur-Marne et Le Perreux (94). Tous niveaux, dès 5 ans. Séance d'essai gratuite, inscription en ligne.",
  keywords: [
    "boxe française Nogent",
    "savate Le Perreux",
    "club de boxe Val-de-Marne",
    "savate fitness 94",
    "Punching Boxe Nogent",
    "cours de boxe Nogent-sur-Marne",
  ],
  authors: [{ name: CLUB.nom }],
  openGraph: {
    type: "website",
    locale: "fr_FR",
    url: SITE_URL,
    siteName: CLUB.nom,
    title: "Punching Boxe Nogent-Le Perreux — Boxe Française & Savate",
    description:
      "La Boxe Française au cœur du Val-de-Marne. Séance d'essai gratuite, inscription en ligne.",
    images: [{ url: "/images/IMG_0558.jpg", width: 1200, height: 630, alt: CLUB.nom }],
  },
  twitter: {
    card: "summary_large_image",
    title: "Punching Boxe Nogent-Le Perreux",
    description: "Club de Boxe Française & Savate Fitness dans le Val-de-Marne.",
    images: ["/images/IMG_0558.jpg"],
  },
  alternates: { canonical: SITE_URL },
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html
      lang="fr"
      className={`${archivo.variable} ${manrope.variable} h-full antialiased`}
    >
      <body className="min-h-full bg-paper text-ink">{children}</body>
    </html>
  );
}
