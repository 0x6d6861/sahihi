import { mkdirSync } from "node:fs"
import path from "node:path"
import type { Browser, BrowserContextOptions, Locator, Page } from "@playwright/test"
import { OUT_DIR } from "./env"
import { settle } from "./seed"

/** Next's dev-mode badge and toasts aren't part of the product. */
const HIDE = "nextjs-portal{display:none!important} [data-sonner-toaster]{display:none!important}"

/** 1.5×: sharp enough to compare text sizes against the coded screens. */
export const DESKTOP = { width: 1440, height: 900 }
export const SCALE = 1.5

export async function newPage(browser: Browser, opts: BrowserContextOptions = {}): Promise<Page> {
  const context = await browser.newContext({
    viewport: DESKTOP,
    deviceScaleFactor: SCALE,
    colorScheme: "light",
    ...opts,
  })
  const page = await context.newPage()
  page.on("load", () => void page.addStyleTag({ content: HIDE }).catch(() => {}))
  return page
}

export async function open(page: Page, url: string) {
  await page.goto(url)
  await settle(page)
  await page.addStyleTag({ content: HIDE })
  await page.waitForTimeout(800)
}

/**
 * The current screen in light, then dark: `<name>-light.jpg` and `<name>-dark.jpg`. The app follows
 * `prefers-color-scheme` live (lib/theme.ts), so flipping the media emulation re-themes the same
 * page without a reload, keeping whatever state it's in. `target` crops to one element.
 */
export async function shoot(page: Page, name: string, target?: Locator) {
  mkdirSync(OUT_DIR, { recursive: true })
  // Sticky bars would paint over a cropped element once it's scrolled under them.
  const unstick = target
    ? await page.addStyleTag({ content: "header,[class*='sticky']{position:relative!important}" })
    : null
  if (target) await target.evaluate((el) => el.scrollIntoView({ block: "center" }))
  for (const scheme of ["light", "dark"] as const) {
    await page.emulateMedia({ colorScheme: scheme })
    await page.waitForTimeout(500)
    const file = path.join(OUT_DIR, `${name}-${scheme}.jpg`)
    const opts = { path: file, type: "jpeg" as const, quality: 82, animations: "disabled" as const }
    if (target) await target.screenshot(opts)
    else await page.screenshot(opts)
  }
  await page.emulateMedia({ colorScheme: "light" })
  await unstick?.evaluate((el) => el.remove())
}
