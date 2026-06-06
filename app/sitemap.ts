import type { MetadataRoute } from "next";
import { SITE_URL } from "@/lib/constants";

export default function sitemap(): MetadataRoute.Sitemap {
  const now = new Date();
  const routes = [
    { path: "", priority: 1, freq: "weekly" as const },
    { path: "/activites", priority: 0.9, freq: "monthly" as const },
    { path: "/inscription", priority: 0.9, freq: "monthly" as const },
    { path: "/infos", priority: 0.8, freq: "monthly" as const },
    { path: "/equipe", priority: 0.6, freq: "monthly" as const },
    { path: "/contact", priority: 0.7, freq: "monthly" as const },
  ];
  return routes.map((r) => ({
    url: `${SITE_URL}${r.path}`,
    lastModified: now,
    changeFrequency: r.freq,
    priority: r.priority,
  }));
}
