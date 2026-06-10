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
      "Punching Boxe Nogent-Le Perreux | Club de Boxe Française et Savate depuis 2000",
    template: "%s · Punching Boxe Nogent-Le Perreux",
  },
  description:
    "Club de boxe, savate et préparation physique à Nogent-sur-Marne et Le Perreux (94). Cours de boxe française, savate, fitness et remise en forme pour enfants et adultes dès 5 ans. 200+ adhérents, 4 salles. Inscription 100% en ligne.",
  keywords: [
    "club de boxe Nogent-sur-Marne",
    "cours de boxe Le Perreux",
    "boxe française Val-de-Marne",
    "cours de savate Nogent",
    "cours de fitness Nogent-sur-Marne",
    "cours de remise en forme Le Perreux",
    "préparation physique 94",
    "salle de sport Nogent Le Perreux",
    "cours boxe enfants adultes 94",
    "inscription boxe en ligne",
    "club sport est parisien",
  ],
  authors: [{ name: CLUB.nom }],
  alternates: { canonical: "/" },
  openGraph: {
    type: "website",
    locale: "fr_FR",
    url: SITE_URL,
    siteName: CLUB.nom,
    title:
      "Punching Boxe Nogent-Le Perreux | Club de Boxe Française et Savate depuis 2000",
    description:
      "Club de boxe, savate et préparation physique à Nogent-sur-Marne et Le Perreux (94). Cours de boxe, savate, fitness et remise en forme, enfants et adultes. Inscription 100% en ligne.",
    images: [{ url: "/images/IMG_0558.jpg", width: 1200, height: 630, alt: CLUB.nom }],
  },
  twitter: {
    card: "summary_large_image",
    title: "Punching Boxe Nogent-Le Perreux — Boxe, Savate & Préparation physique",
    description:
      "Club de boxe française, savate, fitness et remise en forme dans le Val-de-Marne. Inscription 100% en ligne.",
    images: ["/images/IMG_0558.jpg"],
  },
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
