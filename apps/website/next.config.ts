import createMDX from "@next/mdx"
import type { NextConfig } from "next"

const nextConfig: NextConfig = {
  cacheComponents: true,
  partialPrefetching: true,
  // .mdx files are pages too: developers, security, privacy and terms under app/(pages).
  pageExtensions: ["ts", "tsx", "mdx"],
  // The verify pages call the public verify API through this site, as the app does: same origin,
  // and the API sees the visitor's address for its rate limit. API_URL is the one setting the site
  // reads (server side, at build and start).
  async rewrites() {
    const api = process.env.API_URL ?? "http://localhost:4000"
    return [{ source: "/api/verify/:path*", destination: `${api}/api/verify/:path*` }]
  },
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
}

// Code blocks are highlighted at build time (Shiki), in a light and a dark theme at once; CSS picks
// one from <html data-theme> (globals.css → Code). Turbopack takes plugins by name with plain
// options, so no functions here.
const withMDX = createMDX({
  options: {
    rehypePlugins: [
      [
        "rehype-pretty-code",
        { theme: { light: "github-light", dark: "github-dark" }, keepBackground: false },
      ],
    ],
  },
})

export default withMDX(nextConfig)
