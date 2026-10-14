#!/usr/bin/env bun
/**
 * Drives a running Sahihi (start.sh) as a signed-in user. Run from the repo root:
 *
 *   bun .claude/skills/run-sahihi/driver.mjs session [--plan enterprise]   new user + workspace
 *   bun .claude/skills/run-sahihi/driver.mjs api GET /storage                authenticated API call
 *   bun .claude/skills/run-sahihi/driver.mjs api POST /storage/connections '{"…":…}'
 *   bun .claude/skills/run-sahihi/driver.mjs upload fixtures/coords-cropbox.pdf "Lease.pdf"
 *   bun .claude/skills/run-sahihi/driver.mjs shot /settings/storage [--theme dark] [--out name] [--wait "Text"]
 *   bun .claude/skills/run-sahihi/driver.mjs flow my-flow.mjs [--theme dark]
 *
 * State lives in .run/ (gitignored): session.json (the signed-in user) and shots/*.png.
 * A flow module exports `default async ({ page, goto, shot, api, session }) => {}`.
 */
import { execFileSync } from "node:child_process"
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs"
import { resolve } from "node:path"

const WEB = process.env.WEB ?? "http://localhost:3000"
const RUN = resolve(".run")
const SESSION = `${RUN}/session.json`
mkdirSync(`${RUN}/shots`, { recursive: true })

const [cmd, ...rest] = process.argv.slice(2)
const flag = (name, fallback) => {
  const i = rest.indexOf(`--${name}`)
  return i === -1 ? fallback : rest[i + 1]
}
const positional = rest.filter((a, i) => !a.startsWith("--") && !rest[i - 1]?.startsWith("--"))

function loadSession() {
  if (!existsSync(SESSION)) throw new Error("No session: run `driver.mjs session` first")
  return JSON.parse(readFileSync(SESSION, "utf8"))
}

/** fetch against the web origin (/api is rewritten to the API), with the session cookie. */
async function api(method, path, body, session = loadSession()) {
  const res = await fetch(`${WEB}/api${path}`, {
    method,
    headers: {
      cookie: session.cookie,
      origin: WEB,
      ...(body !== undefined && { "content-type": "application/json" }),
    },
    body: body === undefined ? undefined : typeof body === "string" ? body : JSON.stringify(body),
    redirect: "manual",
  })
  const text = await res.text()
  let data = text
  try {
    data = JSON.parse(text)
  } catch {}
  return { status: res.status, data }
}

async function newSession(plan) {
  const stamp = Date.now()
  const email = `agent-${stamp}@example.test`
  const password = `Agent-${stamp}-pw!`
  const post = (path, body, cookie = "") =>
    fetch(`${WEB}/api/auth${path}`, {
      method: "POST",
      headers: { "content-type": "application/json", origin: WEB, cookie },
      body: JSON.stringify(body),
    })
  const signUp = await post("/sign-up/email", { email, password, name: "Agent Demo" })
  if (!signUp.ok) throw new Error(`sign-up: ${signUp.status} ${await signUp.text()}`)
  // Sign-in needs a verified email; there's no inbox to click, so set it in the database.
  execFileSync("docker", [
    "exec",
    "sahihi-postgres-1",
    "psql",
    "-U",
    "sahihi",
    "-d",
    "sahihi",
    "-qc",
    `update "user" set "emailVerified" = true where email = '${email}'`,
  ])
  const signIn = await post("/sign-in/email", { email, password })
  if (!signIn.ok) throw new Error(`sign-in: ${signIn.status} ${await signIn.text()}`)
  const cookie = signIn.headers
    .getSetCookie()
    .map((c) => c.split(";")[0])
    .join("; ")
  const slug = `agent-${stamp}`
  const org = await post("/organization/create", { name: "Acme Legal", slug }, cookie)
  if (!org.ok) throw new Error(`organization: ${org.status} ${await org.text()}`)
  const { id: organizationId } = await org.json()
  if (plan !== "free") {
    execFileSync("bun", ["run", "billing:set-plan", slug, plan], { stdio: "ignore" })
  }
  const session = { email, password, cookie, slug, organizationId, plan }
  writeFileSync(SESSION, JSON.stringify(session, null, 2))
  return session
}

async function browserPage(theme) {
  const { chromium } = await import(resolve("apps/e2e/node_modules/@playwright/test/index.mjs"))
  // The pinned Playwright expects a newer Chromium build than the one baked into the image.
  const executablePath =
    process.env.CHROMIUM_PATH ??
    (existsSync("/opt/pw-browsers/chromium") ? "/opt/pw-browsers/chromium" : undefined)
  const browser = await chromium.launch({ executablePath, args: ["--no-sandbox"] })
  const ctx = await browser.newContext({
    viewport: { width: 1280, height: 900 },
    colorScheme: theme,
  })
  const session = loadSession()
  await ctx.addCookies([
    ...session.cookie.split("; ").map((pair) => {
      const [name, ...value] = pair.split("=")
      return { name, value: value.join("="), url: WEB }
    }),
    // The app reads the theme from this cookie (apps/web/lib/theme.ts).
    { name: "sahihi-theme", value: theme, url: WEB },
  ])
  const page = await ctx.newPage()
  const problems = []
  page.on("pageerror", (e) => problems.push(`pageerror: ${e.message}`))
  page.on("console", (m) => {
    if (m.type() === "error" && !/favicon/i.test(m.location()?.url ?? "")) {
      problems.push(`console: ${m.text()}`)
    }
  })
  page.on("response", (r) => {
    if (r.status() >= 400 && !r.url().endsWith("/favicon.ico"))
      problems.push(`${r.status()} ${r.url()}`)
  })
  const goto = (path) => page.goto(path.startsWith("http") ? path : `${WEB}${path}`)
  const shot = async (name) => {
    const file = `${RUN}/shots/${name}.png`
    await page.screenshot({ path: file, fullPage: true })
    console.log(`screenshot: ${file}`)
    return file
  }
  return { browser, page, goto, shot, problems, session }
}

function report(problems) {
  // The browser's own /favicon.ico 404 also surfaces as a console error without a URL.
  const real = problems.filter(
    (p) =>
      p !==
      "console: Failed to load resource: the server responded with a status of 404 (Not Found)",
  )
  console.log(real.length ? `problems:\n  ${real.join("\n  ")}` : "problems: none")
}

switch (cmd) {
  case "session": {
    const s = await newSession(flag("plan", "enterprise"))
    console.log(
      `signed in as ${s.email} · workspace ${s.slug} (${s.organizationId}) · plan ${s.plan}`,
    )
    break
  }
  case "api": {
    const [method, path, body] = positional
    const res = await api(method.toUpperCase(), path, body)
    console.log(
      res.status,
      typeof res.data === "string" ? res.data : JSON.stringify(res.data, null, 2),
    )
    break
  }
  case "upload": {
    const [file, name = file.split("/").pop()] = positional
    const bytes = readFileSync(file)
    const created = await api("POST", "/documents/uploads", {
      name,
      sizeBytes: bytes.byteLength,
      contentType: "application/pdf",
    })
    if (created.status !== 201)
      throw new Error(`upload: ${created.status} ${JSON.stringify(created.data)}`)
    const put = await fetch(created.data.uploadUrl, {
      method: "PUT",
      body: bytes,
      headers: { "content-type": "application/pdf" },
    })
    if (!put.ok) throw new Error(`PUT to storage: ${put.status}`)
    const done = await api("POST", `/documents/${created.data.document.id}/complete`)
    console.log(done.status, `document ${done.data.document?.id} ${done.data.document?.status}`)
    break
  }
  case "shot": {
    const [path] = positional
    const theme = flag("theme", "light")
    const name = flag(
      "out",
      `${path.replace(/^\/|\/$/g, "").replace(/[^a-z0-9]+/gi, "-") || "home"}-${theme}`,
    )
    const { browser, page, goto, shot, problems } = await browserPage(theme)
    await goto(path)
    const wait = flag("wait")
    if (wait) await page.getByText(wait).first().waitFor({ timeout: 60_000 })
    else await page.waitForLoadState("networkidle", { timeout: 60_000 }).catch(() => {})
    await page.waitForTimeout(500)
    await shot(name)
    report(problems)
    await browser.close()
    break
  }
  case "flow": {
    const [file] = positional
    const ctx = await browserPage(flag("theme", "light"))
    const mod = await import(resolve(file))
    try {
      await mod.default({ ...ctx, api: (m, p, b) => api(m, p, b, ctx.session) })
    } finally {
      report(ctx.problems)
      await ctx.browser.close()
    }
    break
  }
  default:
    console.log("usage: driver.mjs session|api|upload|shot|flow (see the header of this file)")
    process.exit(1)
}
