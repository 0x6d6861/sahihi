import { describe, expect, test } from "bun:test"
import { buildCsp, createNonce, isProtectedPath, PDF_ENGINE_CDN, toOrigin } from "./csp"

const directives = (csp: string) =>
  Object.fromEntries(
    csp.split("; ").map((d) => {
      const [name, ...values] = d.split(" ")
      return [name, values]
    }),
  ) as Record<string, string[]>

describe("buildCsp", () => {
  const prod = directives(
    buildCsp({ nonce: "abc123", dev: false, storageOrigin: "https://files.sahihi.co.ke" }),
  )

  test("scripts: nonce + strict-dynamic, wasm only; no unsafe-inline or unsafe-eval in production", () => {
    expect(prod["script-src"]).toEqual([
      "'self'",
      "'nonce-abc123'",
      "'strict-dynamic'",
      "'wasm-unsafe-eval'",
    ])
  })

  test("no framing, no plugins, no foreign forms or base", () => {
    expect(prod["frame-ancestors"]).toEqual(["'none'"])
    expect(prod["object-src"]).toEqual(["'none'"])
    expect(prod["form-action"]).toEqual(["'self'"])
    expect(prod["base-uri"]).toEqual(["'self'"])
    expect(prod["upgrade-insecure-requests"]).toEqual([])
  })

  test("the PDF engine and presigned storage URLs are reachable", () => {
    expect(prod["connect-src"]).toEqual(["'self'", PDF_ENGINE_CDN, "https://files.sahihi.co.ke"])
    expect(prod["worker-src"]).toEqual(["'self'", "blob:"])
  })

  test("development: React's eval, and no http upgrade (local MinIO)", () => {
    const dev = directives(
      buildCsp({ nonce: "n", dev: true, storageOrigin: "http://localhost:9000" }),
    )
    expect(dev["script-src"]).toContain("'unsafe-eval'")
    expect(dev["upgrade-insecure-requests"]).toBeUndefined()
    expect(dev["connect-src"]).toContain("http://localhost:9000")
  })

  test("frame-ancestors: none by default, exactly the given origins for embedded signing", () => {
    const embedded = directives(
      buildCsp({
        nonce: "n",
        dev: false,
        storageOrigin: null,
        frameAncestors: ["https://app.acme.co.ke"],
      }),
    )
    expect(embedded["frame-ancestors"]).toEqual(["https://app.acme.co.ke"])
    expect(prod["frame-ancestors"]).toEqual(["'none'"])
  })

  test("error reporting origin is allowed only when configured", () => {
    const on = directives(
      buildCsp({
        nonce: "n",
        dev: false,
        storageOrigin: null,
        errorReportingOrigin: "https://o1.ingest.sentry.io",
      }),
    )
    expect(on["connect-src"]).toContain("https://o1.ingest.sentry.io")
  })

  test("without a storage origin, nothing extra is allowed", () => {
    const none = directives(buildCsp({ nonce: "n", dev: false, storageOrigin: null }))
    expect(none["connect-src"]).toEqual(["'self'", PDF_ENGINE_CDN])
    expect(none["img-src"]).toEqual(["'self'", "blob:", "data:"])
  })
})

describe("helpers", () => {
  test("toOrigin keeps only http(s) origins", () => {
    expect(toOrigin("https://bucket.s3.eu-west-1.amazonaws.com/some/key?x=1")).toBe(
      "https://bucket.s3.eu-west-1.amazonaws.com",
    )
    expect(toOrigin("http://localhost:9000")).toBe("http://localhost:9000")
    expect(toOrigin("javascript:alert(1)")).toBeNull()
    expect(toOrigin("not a url")).toBeNull()
    expect(toOrigin(undefined)).toBeNull()
  })

  test("createNonce is random and base64", () => {
    const a = createNonce()
    expect(a).toMatch(/^[A-Za-z0-9+/]{22}==$/)
    expect(createNonce()).not.toBe(a)
  })

  test("isProtectedPath covers the app routes, not public ones", () => {
    for (const p of [
      "/files",
      "/documents",
      "/envelopes/abc",
      "/templates/t1/use",
      "/settings/members",
      "/onboarding",
    ])
      expect({ p, ok: isProtectedPath(p) }).toEqual({ p, ok: true })
    for (const p of ["/", "/sign/tok", "/verify", "/sign-in", "/documents-old"])
      expect({ p, ok: isProtectedPath(p) }).toEqual({ p, ok: false })
  })
})
