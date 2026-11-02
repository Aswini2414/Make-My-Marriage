import type { NextConfig } from "next";

const isDev = process.env.NODE_ENV !== "production";

// Photos and receipts are uploaded to and viewed from R2 with signed URLs.
const R2_ORIGIN = "https://*.r2.cloudflarestorage.com";

const csp = [
  "default-src 'self'",
  // Next.js injects inline scripts; dev mode also needs eval for fast refresh.
  `script-src 'self' 'unsafe-inline'${isDev ? " 'unsafe-eval'" : ""}`,
  "style-src 'self' 'unsafe-inline'",
  `img-src 'self' data: blob: ${R2_ORIGIN}`,
  "font-src 'self'",
  `connect-src 'self' ${R2_ORIGIN}`,
  // YouTube Live embeds on the wedding website.
  "frame-src https://www.youtube.com https://www.youtube-nocookie.com",
  "frame-ancestors 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "object-src 'none'",
].join("; ");

const securityHeaders = [
  { key: "Content-Security-Policy", value: csp },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
];

const noindex = [{ key: "X-Robots-Tag", value: "noindex, nofollow" }];

const nextConfig: NextConfig = {
  // Lets a production build go to its own folder while `next dev` is running.
  distDir: process.env.NEXT_DIST_DIR ?? ".next",
  poweredByHeader: false,
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
  async headers() {
    return [
      { source: "/:path*", headers: securityHeaders },
      // Public guest-facing pages are never listed by search engines.
      { source: "/w/:path*", headers: noindex },
      { source: "/i/:path*", headers: noindex },
      { source: "/u/:path*", headers: noindex },
      { source: "/api/public/:path*", headers: noindex },
    ];
  },
};

export default nextConfig;
