/**
 * Sitemap for the public marketing surface.
 *
 * Only the freelancer-facing routes go in here. App, auth, and admin
 * surfaces are deliberately excluded — they're behind login and don't
 * benefit from crawler discovery.
 *
 * Next.js reads this file at build time and produces /sitemap.xml.
 */

import type { MetadataRoute } from "next";

const SITE = "https://www.leadash.com";

export default function sitemap(): MetadataRoute.Sitemap {
  const now = new Date();
  const routes: { path: string; changeFreq: "weekly" | "monthly"; priority: number }[] = [
    { path: "/",          changeFreq: "weekly",  priority: 1.0 },
    { path: "/about",     changeFreq: "monthly", priority: 0.7 },
    { path: "/beta",      changeFreq: "monthly", priority: 0.6 },
    { path: "/extension", changeFreq: "monthly", priority: 0.6 },
    { path: "/contact",   changeFreq: "monthly", priority: 0.5 },
    { path: "/privacy",   changeFreq: "monthly", priority: 0.3 },
    { path: "/terms",     changeFreq: "monthly", priority: 0.3 },
  ];

  return routes.map(r => ({
    url:            `${SITE}${r.path}`,
    lastModified:   now,
    changeFrequency: r.changeFreq,
    priority:       r.priority,
  }));
}
