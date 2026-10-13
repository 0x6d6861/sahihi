// Visual check for agents: screenshots the home page at desktop and phone widths
// and reports runtime errors (including hydration mismatches) and horizontal
// overflow, in light and dark colour schemes. A final pass loads the page with
// reduced motion, which takes a different render path (static hero, rows that
// snap instead of glide). The MDX pages get one full-page shot per pass.
//
//   bun run build && bun run start &      # serve on :3001 (or set BASE_URL)
//   bun run shots                          # writes to ./.shots/
//
// First run on a new machine: `bunx playwright install chromium`.

import { mkdirSync } from "node:fs"
import { chromium } from "playwright"

const base = process.env.BASE_URL ?? "http://localhost:3001"
const out = process.env.OUT_DIR ?? ".shots"
mkdirSync(out, { recursive: true })

const viewports = {
  desktop: { width: 1288, height: 900 },
  mobile: { width: 390, height: 844 },
}
const passes = [
  ...Object.entries(viewports).map(([name, viewport]) => ({
    name,
    viewport,
    colorScheme: "light",
  })),
  ...Object.entries(viewports).map(([name, viewport]) => ({
    name: `dark-${name}`,
    viewport,
    colorScheme: "dark",
  })),
]

const browser = await chromium.launch()
const problems = []

for (const { name, viewport, colorScheme } of passes) {
  const page = await browser.newPage({ viewport, colorScheme })
  page.on("pageerror", (e) => problems.push(`${name}: pageerror: ${e.message}`))
  page.on("console", (m) => m.type() === "error" && problems.push(`${name}: console: ${m.text()}`))
  await page.goto(base, { waitUntil: "networkidle" })

  const { height, overflow } = await page.evaluate(() => ({
    height: document.documentElement.scrollHeight,
    overflow: document.documentElement.scrollWidth > window.innerWidth,
  }))
  if (overflow) problems.push(`${name}: horizontal overflow`)

  // Six stops inside the pinned hero. Its track is 320svh, so it scrolls for 2.2
  // viewports: progress ≈ 0, .14, .25, .45, .68, .93. Then one stop per viewport.
  const stops = [0, 0.3, 0.55, 1.0, 1.5, 2.05].map((f) => Math.round(f * viewport.height))
  for (let y = viewport.height * 2.4; y < height; y += viewport.height * 0.95)
    stops.push(Math.round(y))

  let i = 0
  for (const y of stops) {
    await page.evaluate((top) => window.scrollTo(0, top), y)
    await page.waitForTimeout(600)
    await page.screenshot({
      path: `${out}/${name}-${String(i++).padStart(2, "0")}.jpg`,
      type: "jpeg",
      quality: 65,
    })
  }
  console.log(`${name}: ${i} shots, page height ${height}px`)
}

// The MDX pages: errors, overflow and one full-page shot each, per pass.
for (const path of ["/developers", "/security", "/privacy", "/terms"]) {
  for (const { name, viewport, colorScheme } of passes) {
    const label = `${name}${path.replace("/", "-")}`
    const page = await browser.newPage({ viewport, colorScheme })
    page.on("pageerror", (e) => problems.push(`${label}: pageerror: ${e.message}`))
    page.on(
      "console",
      (m) => m.type() === "error" && problems.push(`${label}: console: ${m.text()}`),
    )
    await page.goto(`${base}${path}`, { waitUntil: "networkidle" })
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth > window.innerWidth,
    )
    if (overflow) problems.push(`${label}: horizontal overflow`)
    await page.waitForTimeout(600)
    await page.screenshot({
      path: `${out}/${label}.jpg`,
      type: "jpeg",
      quality: 65,
      fullPage: true,
    })
    await page.close()
  }
  console.log(`${path}: checked`)
}

// Reduced-motion pass: errors only, plus one shot of the static hero.
{
  const page = await browser.newPage({ viewport: viewports.desktop, reducedMotion: "reduce" })
  page.on("pageerror", (e) => problems.push(`reduced-motion: pageerror: ${e.message}`))
  page.on(
    "console",
    (m) =>
      m.type() === "error" && problems.push(`reduced-motion: console: ${m.text().split("\n")[0]}`),
  )
  await page.goto(base, { waitUntil: "networkidle" })
  await page.waitForTimeout(800)
  await page.screenshot({ path: `${out}/reduced-00.jpg`, type: "jpeg", quality: 65 })
  console.log("reduced-motion: checked")
}

await browser.close()
if (problems.length) {
  console.error(`Problems:\n${problems.map((p) => `  - ${p}`).join("\n")}`)
  process.exit(1)
}
console.log(`OK — no runtime errors, no horizontal overflow. Shots in ${out}/`)
