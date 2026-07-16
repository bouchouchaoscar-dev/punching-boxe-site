import type { Metadata } from "next";
import { Archivo, Manrope } from "next/font/google";
import "./globals.css";
import { CLUB, SEO, SITE_URL } from "@/lib/constants";

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
    default: SEO.titleDefault,
    template: SEO.titleTemplate,
  },
  description: SEO.description,
  keywords: [...SEO.keywords],
  authors: [{ name: CLUB.nom }],
  alternates: { canonical: "/" },
  openGraph: {
    type: "website",
    locale: "fr_FR",
    url: SITE_URL,
    siteName: CLUB.nom,
    title: SEO.ogTitle,
    description: SEO.ogDescription,
    images: [{ url: SEO.ogImage, width: 1200, height: 630, alt: CLUB.nom }],
  },
  twitter: {
    card: "summary_large_image",
    title: SEO.twitterTitle,
    description: SEO.twitterDescription,
    images: [SEO.ogImage],
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
