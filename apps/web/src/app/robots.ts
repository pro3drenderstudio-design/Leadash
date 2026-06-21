/**
 * robots.txt — allow crawlers across the public surface, keep them out
 * of authed/app/admin/api routes. Sitemap pointer included so search
 * engines find the listing without scraping.
 */

import type { MetadataRoute } from "next";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: "*",
        allow: "/",
        disallow: [
          "/api/",
          "/admin/",
          "/dashboard/",
          "/login",
          "/signup",
          "/onboarding",
          "/pay/",
        ],
      },
    ],
    sitemap: "https://www.leadash.com/sitemap.xml",
  };
}
