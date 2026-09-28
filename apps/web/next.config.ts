import type { NextConfig } from "next"

const API_URL = process.env.API_URL ?? "http://localhost:4000"

const config: NextConfig = {
  // Workspace packages ship TypeScript source
  transpilePackages: ["@sahihi/core"],
  // Same-origin API: browser calls /api/*, Next proxies to the Hono API.
  // Keeps better-auth cookies first-party (docs/auth.md → Cookies).
  async rewrites() {
    return [{ source: "/api/:path*", destination: `${API_URL}/api/:path*` }]
  },
  async headers() {
    return [
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
