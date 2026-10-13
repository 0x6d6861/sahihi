import createMDX from "@next/mdx"
import type { NextConfig } from "next"

const nextConfig: NextConfig = {
  cacheComponents: true,
  partialPrefetching: true,
  // .mdx files are pages too: developers, security, privacy and terms under app/(pages).
  pageExtensions: ["ts", "tsx", "mdx"],
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
