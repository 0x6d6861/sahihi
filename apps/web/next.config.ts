import type { NextConfig } from "next"

const API_URL = process.env.API_URL ?? "http://localhost:4000"

// proxy.ts allows presigned uploads/downloads only to this origin (CSP connect-src). Without it,
// uploads and the PDF viewers would be blocked, so refuse to build or start production without it.
if (process.env.NODE_ENV === "production" && !process.env.STORAGE_ORIGIN) {
  throw new Error("STORAGE_ORIGIN is required in production (the S3 origin of presigned URLs)")
}

const config: NextConfig = {
  // Workspace packages ship TypeScript source
  transpilePackages: ["@sahihi/core"],
  // Same-origin API: browser calls /api/*, Next proxies to the Hono API.
  // Keeps better-auth cookies first-party (docs/auth.md → Cookies).
  async rewrites() {
    return [{ source: "/api/:path*", destination: `${API_URL}/api/:path*` }]
  },
  poweredByHeader: false,
  async headers() {
    return [
      {
        // Baseline for every response. The CSP is per request (proxy.ts). /sign overrides the
        // referrer policy below (later entries win).
        source: "/:path*",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          {
            key: "Permissions-Policy",
            value: "camera=(), microphone=(), geolocation=(), payment=()",
          },
          { key: "Strict-Transport-Security", value: "max-age=31536000; includeSubDomains" },
        ],
      },
      {
        // Signing links are secrets — never leak them via Referer
        source: "/sign/:path*",
        headers: [
          { key: "Referrer-Policy", value: "no-referrer" },
          { key: "X-Robots-Tag", value: "noindex, nofollow" },
        ],
      },
    ]
  },
}

export default config
