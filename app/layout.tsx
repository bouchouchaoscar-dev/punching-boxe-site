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
      "Punching Boxe Nogent-Le Perreux | Club de Boxe Française & Savate depuis 2000",
    template: "%s · Punching Boxe Nogent-Le Perreux",
  },
  description:
    "Club de Boxe Française et Savate à Nogent-sur-Marne et Le Perreux. Cours enfants et adultes, Savate Fitness, Préparation Physique. 200+ adhérents. Inscription en ligne.",
  keywords: [
    "club boxe française Nogent-sur-Marne",
    "boxe française Val-de-Marne",
    "cours boxe Nogent Le Perreux",
    "savate fitness Nogent",
    "cours préparation physique Nogent",
    "cardio training Val-de-Marne",
    "club sport Nogent-sur-Marne",
    "cours boxe enfants adultes 94",
  ],
  authors: [{ name: CLUB.nom }],
  alternates: { canonical: "/" },
  openGraph: {
    type: "website",
    locale: "fr_FR",
    url: SITE_URL,
    siteName: CLUB.nom,
    title:
      "Punching Boxe Nogent-Le Perreux | Club de Boxe Française & Savate depuis 2000",
    description:
      "Club de Boxe Française et Savate à Nogent-sur-Marne et Le Perreux. Cours enfants et adultes, Savate Fitness, Préparation Physique. Inscription en ligne.",
    images: [{ url: "/images/IMG_0558.jpg", width: 1200, height: 630, alt: CLUB.nom }],
  },
  twitter: {
    card: "summary_large_image",
    title: "Punching Boxe Nogent-Le Perreux — Boxe Française & Savate",
    description: "Club de Boxe Française & Savate Fitness dans le Val-de-Marne.",
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
