import type { MetadataRoute } from "next"
import { site } from "@/content/site"

// A constant, not new Date(): prerendering can't read the clock (AGENTS.md, Gotchas).
const lastModified = "2026-10-13"

export default function sitemap(): MetadataRoute.Sitemap {
  return ["", "/developers", "/security", "/privacy", "/terms"].map((path) => ({
    url: `${site.url}${path}`,
    lastModified,
  }))
}
