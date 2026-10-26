import type { MetadataRoute } from "next";

// Pages are kept out of search results with "noindex", not here: a crawler blocked by
// robots.txt never sees a noindex, and can still list the bare URL from outside links.
// Wedding websites, invitations and upload pages send an X-Robots-Tag header
// (next.config.ts); the (auth) and (dashboard) layouts set robots metadata.
export default function robots(): MetadataRoute.Robots {
  return {
    rules: { userAgent: "*", allow: "/", disallow: "/api/" },
  };
}
