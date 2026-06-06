import type { Metadata } from "next";
import { CLUB } from "./constants";

/** Construit les metadata SEO d'une page (title absolu, description, canonical, OG, Twitter). */
export function pageMeta({
  title,
  description,
  path,
  image = "/images/IMG_0558.jpg",
}: {
  title: string;
  description: string;
  path: string;
  image?: string;
}): Metadata {
  return {
    title: { absolute: title },
    description,
    alternates: { canonical: path },
    openGraph: {
      type: "website",
      locale: "fr_FR",
      siteName: CLUB.nom,
      url: path,
      title,
      description,
      images: [{ url: image, width: 1200, height: 630, alt: title }],
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
      images: [image],
    },
  };
}
