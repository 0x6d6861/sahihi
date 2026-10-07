import { describe, expect, test } from "bun:test"
import type { ReactElement } from "react"
import { brandFor, safeLogoUrl } from "./brand"
import * as t from "./index"

const brand = { organizationName: "Acme Ltd", logoUrl: null }
const url = "https://sahihi.test/sign/abc123"

describe("safeLogoUrl", () => {
  test("only absolute https URLs are embedded", () => {
    expect(safeLogoUrl("https://cdn.acme.test/logo.png")).toBe("https://cdn.acme.test/logo.png")
    for (const bad of [
      "http://acme.test/logo.png",
      "javascript:alert(1)",
      "data:image/png;base64,AAAA",
      "/logo.png",
      "",
      null,
      undefined,
      `https://acme.test/${"a".repeat(3000)}`,
    ]) {
      expect(safeLogoUrl(bad)).toBeNull()
    }
  })
  test("the app's own origin is trusted over http (local development)", () => {
    const own = "http://localhost:3000/api/branding/org_1/logo.png?v=1"
    expect(safeLogoUrl(own, "http://localhost:3000")).toBe(own)
    expect(safeLogoUrl("http://evil.test/logo.png", "http://localhost:3000")).toBeNull()
    expect(safeLogoUrl("javascript:alert(1)", "http://localhost:3000")).toBeNull()
  })
  test("brandFor keeps the name and drops unsafe logos", () => {
    expect(brandFor({ name: "Acme", logo: "http://x.test/l.png" })).toEqual({
      organizationName: "Acme",
      logoUrl: null,
    })
  })
})

describe("templates", () => {
  test("every template renders html + text with a subject", async () => {
    const all = await Promise.all([
      t.signingInvite({
        brand,
        recipientName: "Wanjiku",
        senderName: "Amina",
        title: "Lease",
        message: null,
        url,
      }),
      t.envelopeCompleted({ brand, name: "Wanjiku", title: "Lease", url }),
      t.envelopeDeclined({
        brand,
        name: "Amina",
        title: "Lease",
        declinedBy: "Kip",
        reason: "Wrong address",
      }),
      t.envelopeVoided({ brand, name: "Wanjiku", title: "Lease", reason: null }),
      t.otpEmail({ name: "Wanjiku", code: "482913" }),
      t.authLink({
        name: "Amina",
        heading: "Verify your email",
        body: "Confirm it.",
        label: "Verify",
        url,
      }),
    ])
    for (const e of all) {
      expect(e.subject.length).toBeGreaterThan(0)
      expect(e.html).toStartWith("<!DOCTYPE html")
      expect(e.text.length).toBeGreaterThan(20)
      expect(e.text).not.toContain("<")
    }
  })

  test("user input is escaped in the HTML (titles, messages, names are untrusted)", async () => {
    const e = await t.signingInvite({
      brand: { organizationName: "<b>Evil Org</b>", logoUrl: null },
      recipientName: "<img src=x onerror=alert(1)>",
      senderName: "Amina",
      title: '"><script>alert(1)</script>',
      message: "<a href='javascript:x'>click</a>",
      url,
    })
    expect(e.html).not.toContain("<script>")
    expect(e.html).not.toContain("<img src=x")
    expect(e.html).not.toContain("<b>Evil Org</b>")
    expect(e.html).not.toContain("href='javascript:x'")
    expect(e.html).toContain("&lt;script&gt;")
  })

  test("signing invite: org branding, message, link in both parts, reminder wording", async () => {
    const e = await t.signingInvite({
      brand: { organizationName: "Acme Ltd", logoUrl: "https://cdn.acme.test/logo.png" },
      recipientName: "Wanjiku",
      senderName: "Amina",
      title: "Lease",
      message: "Please sign by Friday.\nThanks!",
      url,
      reminder: true,
    })
    expect(e.subject).toBe('Reminder: Amina sent you "Lease" to sign')
    expect(e.html).toContain('src="https://cdn.acme.test/logo.png"')
    expect(e.html).toContain("Sent via Sahihi on behalf of Acme Ltd")
    expect(e.html).toContain(`href="${url}"`)
    expect(e.text).toContain(url)
    expect(e.text).toContain("Please sign by Friday.")
    expect(e.text).toContain("Acme Ltd")
  })

  test("without a logo the org name heads the email; auth emails say Sahihi", async () => {
    const invite = await t.signingInvite({
      brand,
      recipientName: "W",
      senderName: "A",
      title: "T",
      message: null,
      url,
    })
    expect(invite.html).not.toContain("<img")
    expect(invite.html).toContain("Acme Ltd")
    const auth = await t.authLink({ name: "A", heading: "Verify", body: "b", label: "Go", url })
    expect(auth.html).toContain("Sahihi")
    expect(auth.html).not.toContain("on behalf of")
  })

  test("the OTP code is in the subject and the text part", async () => {
    const e = await t.otpEmail({ name: "Wanjiku", code: "482913" })
    expect(e.subject).toContain("482913")
    expect(e.text).toContain("482913")
  })
})

describe("preview data", () => {
  test("every template renders with its PreviewProps (what `emails:dev` shows)", async () => {
    const { createElement } = await import("react")
    const { renderEmail } = await import("./render")
    for (const [name, { component, subject }] of Object.entries(t.TEMPLATES)) {
      const props = (component as unknown as { PreviewProps: never }).PreviewProps
      expect({ name, hasPreview: props !== undefined }).toEqual({ name, hasPreview: true })
      // Each entry pairs a component with its own props; widen the union of six types to one.
      type Props = Record<string, unknown>
      const Component = component as unknown as (p: Props) => ReactElement
      const e = await renderEmail(
        (subject as unknown as (p: Props) => string)(props),
        createElement(Component, props as Props),
      )
      expect(e.subject.length).toBeGreaterThan(0)
      expect(e.html).toContain("<!DOCTYPE html")
    }
  })
})
