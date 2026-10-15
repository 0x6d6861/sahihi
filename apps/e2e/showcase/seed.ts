import { type APIRequestContext, type Browser, expect, type Page } from "@playwright/test"
import { MAILPIT_URL } from "../env"
import { linkFromEmail } from "../tests/mailpit"
import { createWorkspace } from "../tests/onboarding"

const SIGN_LINK = /https?:\/\/[^\s"<>]+\/sign\/[A-Za-z0-9_-]{43}/

/** The signing link in the newest email to `to` that mentions `title` (one person, many envelopes). */
export async function signingLink(to: string, title: string): Promise<string> {
  let found = ""
  await expect
    .poll(
      async () => {
        const q = encodeURIComponent(`to:"${to}" "${title}"`)
        const res = await fetch(`${MAILPIT_URL}/api/v1/search?query=${q}`)
        const { messages = [] } = (await res.json()) as { messages?: { ID: string }[] }
        for (const m of messages) {
          const msg = (await (await fetch(`${MAILPIT_URL}/api/v1/message/${m.ID}`)).json()) as {
            Text: string
          }
          const match = msg.Text.match(SIGN_LINK)
          if (match) {
            found = match[0]
            return true
          }
        }
        return false
      },
      { timeout: 60_000, intervals: [1_000] },
    )
    .toBe(true)
  return found
}

/**
 * The showcase workspace: a Nairobi freight company and the people it deals with. Every name,
 * company and address is fictional; emails only ever reach Mailpit.
 */
export const people = {
  achieng: { name: "Achieng Otieno", email: "achieng@tanafreight.co.ke" },
  david: { name: "David Kariuki", email: "david@tanafreight.co.ke" },
  baraka: { name: "Baraka Mwangi", email: "baraka@kilimaagro.co.ke" },
  amina: { name: "Amina Hassan", email: "amina@hassanadvocates.co.ke" },
  juma: { name: "Juma Ochieng", email: "juma.ochieng@gmail.com" },
  njeri: { name: "Njeri Wambui", email: "njeri@tanafreight.co.ke" },
  wanjiru: { name: "Wanjiru Kamau", email: "wanjiru@tanafreight.co.ke" },
  grace: { name: "Grace Njoroge", email: "grace@savannafresh.co.ke" },
}
export const workspace = "Tana Freight Ltd"
export const password = "Showcase-tana-freight-2026"

const ADDRESS = {
  tana: "Godown 14, Enterprise Road, Industrial Area, Nairobi",
  kilima: "Plot 22, Kampala Road, Eldoret",
}

/** Blank values per starter, by variable key. */
export const blanks: Record<string, Record<string, string>> = {
  "mutual-nda": {
    effective_date: "1 November 2026",
    party_a_name: workspace,
    party_a_address: ADDRESS.tana,
    party_b_name: "Kilima Agro Ltd",
    party_b_address: ADDRESS.kilima,
    purpose: "evaluating a cold-chain logistics partnership for fresh produce from the Rift Valley",
    term: "two (2) years",
    survival_period: "three (3) years",
    governing_law: "Kenya",
  },
  "offer-letter": {
    letter_date: "12 October 2026",
    candidate_name: people.juma.name,
    candidate_address: "P.O. Box 4471-00200, Nairobi",
    employer_name: workspace,
    employer_address: ADDRESS.tana,
    job_title: "Operations Coordinator",
    reports_to: "the Operations Director",
    place_of_work: "the Industrial Area depot, Nairobi",
    start_date: "2 November 2026",
    salary: "KES 145,000",
    pay_schedule: "monthly, on the 28th",
    working_hours: "Monday to Friday, 8:00 to 17:00",
    annual_leave: "21 working days",
    probation_period: "three (3) months",
    notice_period: "one (1) month",
    offer_expiry: "23 October 2026",
    governing_law: "Kenya",
  },
  "acceptable-use-policy": {
    organisation_name: workspace,
    effective_date: "1 October 2026",
    security_contact: "it@tanafreight.co.ke",
    policy_owner: "Head of IT",
    review_date: "1 October 2027",
  },
  "board-resolution": {
    company_name: workspace,
    registration_number: "PVT-7LUQ2KZ8",
    resolution_date: "9 October 2026",
    subject: "a lease of a second depot in Athi River",
    resolution:
      "the Company enter into a five-year lease of Warehouse 3, Export Processing Zone, Athi River, at a monthly rent not exceeding KES 1,200,000",
    authorised_person: "the Managing Director",
  },
}

/** Same-origin calls to the app's /api (the session cookie rides along). */
export class Api {
  constructor(private readonly request: APIRequestContext) {}

  async call<T>(method: "GET" | "POST" | "PUT", url: string, data?: unknown): Promise<T> {
    const res = await this.request.fetch(`/api${url}`, { method, data })
    if (!res.ok()) throw new Error(`${method} ${url} → ${res.status()} ${await res.text()}`)
    return (await res.json()) as T
  }

  /** A generated document from a starter, every blank filled, the signers set. */
  async draftFromStarter(
    starter: string,
    signers: Signer[],
  ): Promise<{ id: string; versionId: string }> {
    const { id } = await this.call<{ id: string }>("POST", "/generated-documents", { starter })
    const { version } = await this.get(id)
    const known = blanks[starter] ?? {}
    const values = version.data.variables.flatMap((v) => {
      const value = known[v.key]
      return value ? [{ key: v.key, value }] : []
    })
    if (values.length) {
      await this.call("POST", `/generated-documents/${id}/variables`, {
        baseVersionId: version.id,
        source: "edit",
        values,
      })
    }
    return { id, versionId: await this.setSigners(id, signers) }
  }

  /** Replace a generated document's signers; returns the new version's id. */
  async setSigners(id: string, signers: Signer[]): Promise<string> {
    const { version } = await this.get(id)
    const current = signerFields(version.data)
    const roles = signers.map((s) => {
      const existing = version.data.roles.find((r) => r.key === s.key)
      return {
        key: s.key,
        label: s.label ?? existing?.label ?? s.key,
        recipientRole: s.viewer ? "VIEWER" : "SIGNER",
        name: s.person.name,
        email: s.person.email,
        initialsOnEveryPage: false,
      }
    })
    const fields: Record<string, unknown[]> = {}
    for (const s of signers) {
      if (s.viewer) continue
      const existing = current.fields[s.key]
      fields[s.key] = existing?.length
        ? existing
        : [
            { fieldType: "SIGNATURE", required: true },
            { fieldType: "NAME", required: true },
            { fieldType: "DATE_SIGNED", required: true },
          ]
    }
    const next = await this.call<{ version: Version }>(
      "PUT",
      `/generated-documents/${id}/signers`,
      {
        baseVersionId: version.id,
        signers: { roles, fields, parties: {} },
      },
    )
    return next.version.id
  }

  get(id: string) {
    return this.call<{
      version: Version
      document: { envelopeId: string | null; documentId: string | null }
    }>("GET", `/generated-documents/${id}`)
  }

  /** Finalise: the PDF and a draft envelope with its recipients and fields. */
  async finalize(id: string, versionId: string): Promise<string> {
    const { envelopeId } = await this.call<{ envelopeId: string }>(
      "POST",
      `/generated-documents/${id}/finalize`,
      { versionId, acknowledged: true },
    )
    return envelopeId
  }

  envelope(id: string) {
    return this.call<{ envelope: Envelope }>("GET", `/envelopes/${id}`)
  }

  send(id: string) {
    return this.call("POST", `/envelopes/${id}/send`, {})
  }

  /** Title, message and order before sending (generated documents start with the starter's name). */
  details(id: string, title: string, message: string, signingOrder = "PARALLEL") {
    return this.call("PUT", `/envelopes/${id}/details`, {
      title,
      message,
      signingOrder,
      expiresAt: null,
    })
  }

  /** Ask one recipient of a draft for an email code before signing. */
  async requireEmailCode(id: string, email: string) {
    const { envelope } = await this.envelope(id)
    await this.call("PUT", `/envelopes/${id}/recipients`, {
      recipients: envelope.recipients.map((r) => ({
        id: r.id,
        name: r.name,
        email: r.email,
        role: r.role,
        order: r.order,
        verification: r.email === email ? "EMAIL_OTP" : "LINK",
      })),
    })
  }
}

type Signer = {
  key: string
  label?: string
  viewer?: boolean
  person: { name: string; email: string }
}

interface Node {
  type: string
  attrs?: Record<string, unknown>
  content?: Node[]
}
interface Version {
  id: string
  data: { variables: { key: string }[]; roles: { key: string; label: string }[]; content: Node }
}

/** Each role's existing fields, from the signature blocks (as `currentSigners` in @sahihi/core). */
function signerFields(data: Version["data"]) {
  const fields: Record<string, unknown[]> = {}
  const walk = (n: Node) => {
    if (n.type === "signatureBlock") {
      const key = String(n.attrs?.roleKey)
      fields[key] ??= []
      for (const c of n.content ?? []) {
        if (c.type === "field") {
          const a = c.attrs ?? {}
          fields[key].push({
            id: a.id,
            fieldType: a.fieldType,
            ...(a.label ? { label: a.label } : {}),
            required: a.required ?? true,
          })
        }
      }
    }
    for (const c of n.content ?? []) walk(c)
  }
  walk(data.content)
  return { fields }
}
export interface Envelope {
  id: string
  status: string
  documents: { documentId: string; id: string }[]
  recipients: {
    id: string
    name: string
    email: string
    status: string
    role: string
    order: number
  }[]
  certificate: { code: string } | null
}

/** Dev pages compile on first visit; wait for the network to go quiet before typing. */
export async function settle(page: Page) {
  await page.waitForLoadState("networkidle")
}

/** Forget earlier runs' emails to the showcase people (only theirs: Mailpit is shared with dev). */
export async function clearMail() {
  const mailpit = MAILPIT_URL
  for (const p of Object.values(people)) {
    const query = encodeURIComponent(`to:"${p.email}"`)
    await fetch(`${mailpit}/api/v1/search?query=${query}`, { method: "DELETE" })
  }
}

/** Sign up, verify by email, create the workspace. Leaves `page` signed in on All files. */
export async function createAccount(page: Page) {
  await clearMail()
  await page.goto("/sign-up")
  await settle(page)
  await page.getByLabel("Full name").fill(people.achieng.name)
  await page.getByLabel("Work email").fill(people.achieng.email)
  await page.getByLabel("Password", { exact: true }).fill(password)
  await page.getByRole("button", { name: /create account|sign up/i }).click()
  await expect(page.getByText("Check your email")).toBeVisible()
  await page.goto(
    await linkFromEmail(people.achieng.email, /https?:\/\/[^\s"<>]+verify-email[^\s"<>]+/),
  )
  await page.waitForURL(/\/onboarding/)
  await settle(page)
  await createWorkspace(page, workspace)
  await page.waitForURL(/\/files/)
}

/** A hand-drawn signature: a few strokes across the dialog's drawing pad. */
async function draw(page: Page, canvas: ReturnType<Page["locator"]>, seed: number) {
  const box = await canvas.boundingBox()
  if (!box) throw new Error("No signature pad")
  // Cursive-like: forward drift plus loops whose size fades along the name.
  const k = 38 + seed * 4
  const r = (t: number) => 0.05 + 0.07 * Math.abs(Math.sin(t * (7 + seed))) * (1 - t * 0.6)
  const x0 = box.x + box.width * 0.18
  const y0 = box.y + box.height * 0.6
  const w = box.width * 0.62
  const at = (t: number) => ({
    x: x0 + w * t + box.width * r(t) * 0.5 * Math.cos(t * k),
    y: y0 - box.height * (r(t) * 2.2 * Math.sin(t * k) + t * 0.06),
  })
  await page.mouse.move(at(0).x, at(0).y)
  await page.mouse.down()
  for (let i = 1; i <= 140; i++) {
    const p = at(i / 140)
    await page.mouse.move(p.x, p.y)
  }
  await page.mouse.up()
  await page.mouse.move(x0 + w * 0.1, y0 + box.height * 0.12)
  await page.mouse.down()
  await page.mouse.move(x0 + w * 0.95, y0 + box.height * 0.08, { steps: 12 })
  await page.mouse.up()
}

/** Open the newest signing link sent to `email` and look, without signing (status → Viewed). */
export async function openAs(browser: Browser, email: string, title: string) {
  const link = await signingLink(email, title)
  const context = await browser.newContext()
  const page = await context.newPage()
  await page.goto(link)
  await settle(page)
  await context.close()
  return link
}

/** Open the newest signing link sent to `email` and sign every field, as that person would. */
export async function signAs(
  browser: Browser,
  email: string,
  title: string,
  seed: number,
  opts: { stopBeforeFinish?: boolean } = {},
) {
  const link = await signingLink(email, title)
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 } })
  const page = await context.newPage()
  await page.goto(link)
  await settle(page)
  const adds = page.getByRole("button", { name: /Add signature|Add initials/ })
  const count = await adds.count()
  for (let i = 0; i < count; i++) {
    await adds.first().click()
    const dialog = page.getByRole("dialog")
    const pad = dialog.getByText("Sign here").locator("..")
    if (await pad.isVisible().catch(() => false)) {
      await draw(page, pad, seed)
    } else {
      await dialog.getByRole("tab", { name: "Type" }).click()
      await dialog.getByLabel("Type your name").fill(email.split("@")[0] ?? email)
    }
    await dialog.getByRole("button", { name: /Adopt and (place|sign)/ }).click()
  }
  if (opts.stopBeforeFinish) return { context, page }
  await page.getByRole("checkbox", { name: /I agree to sign/ }).click()
  await page.getByRole("button", { name: /^Finish signing/ }).click()
  await expect(page.getByText(/signed|complete/i).first()).toBeVisible()
  await context.close()
  return null
}
