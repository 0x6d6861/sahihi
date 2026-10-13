import { readFile } from "node:fs/promises"
import { join } from "node:path"
import { ImageResponse } from "next/og"
import { site } from "@/content/site"

export const alt = site.title
export const size = { width: 1200, height: 630 }
export const contentType = "image/png"

const geist = await readFile(
  join(process.cwd(), "node_modules/geist/dist/fonts/geist-sans/Geist-Medium.ttf"),
)

/** The social card: the hero headline on the page's paper colour. */
export default async function Image() {
  return new ImageResponse(
    <div
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        flexDirection: "column",
        justifyContent: "space-between",
        padding: 80,
        background: "#f9f9f9",
        color: "rgb(0 0 0 / 0.96)",
        fontFamily: "Geist",
      }}
    >
      <div style={{ fontSize: 40, letterSpacing: "-0.04em" }}>{site.name}</div>
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          fontSize: 112,
          lineHeight: 1,
          letterSpacing: "-0.045em",
        }}
      >
        <span>{site.hero.headline[0]}</span>
        <span>{site.hero.headline[1]}</span>
      </div>
      <div
        style={{ fontSize: 32, color: "rgb(0 0 0 / 0.55)" }}
      >{`${site.pillars.join(". ")}.`}</div>
    </div>,
    { ...size, fonts: [{ name: "Geist", data: geist, style: "normal", weight: 500 }] },
  )
}
