import { describe, expect, test } from "bun:test"
import {
  CreateWebhookSchema,
  checkWebhookUrl,
  decryptSecret,
  encryptSecret,
  envelopeEventData,
  generateWebhookSecret,
  isPrivateAddress,
  signWebhook,
  verifyWebhookSignature,
  webhookBody,
  webhookRetryDelayMs,
} from "./webhooks"

describe("signatures", () => {
  const secret = "whsec_test"
  const body = '{"id":"evt_1","type":"envelope.completed"}'

  test("sign → verify round trip, Stripe-style header", async () => {
    const header = await signWebhook(secret, 1_790_000_000, body)
    expect(header).toMatch(/^t=1790000000,v1=[0-9a-f]{64}$/)
    expect(await verifyWebhookSignature(header, body, secret, { nowSec: 1_790_000_060 })).toBe(true)
  })

  test("rejects a changed body, wrong secret, old timestamp and garbage", async () => {
    const header = await signWebhook(secret, 1_790_000_000, body)
    const now = { nowSec: 1_790_000_000 }
    expect(await verifyWebhookSignature(header, `${body} `, secret, now)).toBe(false)
    expect(await verifyWebhookSignature(header, body, "whsec_other", now)).toBe(false)
    expect(
      await verifyWebhookSignature(header, body, secret, { nowSec: 1_790_000_000 + 301 }),
    ).toBe(false)
    expect(await verifyWebhookSignature("t=abc,v1=00", body, secret, now)).toBe(false)
    expect(await verifyWebhookSignature(undefined, body, secret, now)).toBe(false)
  })

  test("accepts any matching v1 (secret rotation sends two)", async () => {
    const good = await signWebhook(secret, 1_790_000_000, body)
    const header = `t=1790000000,v1=${"0".repeat(64)},${good.split(",")[1]}`
    expect(await verifyWebhookSignature(header, body, secret, { nowSec: 1_790_000_000 })).toBe(true)
  })

  test("secrets are random whsec_ strings", () => {
    const a = generateWebhookSecret()
    expect(a).toMatch(/^whsec_[A-Za-z0-9_-]{43}$/)
    expect(generateWebhookSecret()).not.toBe(a)
  })
})

describe("secret encryption", () => {
  test("round trip; a different master key can't decrypt; ciphertext is not the secret", async () => {
    const stored = await encryptSecret("master-key-1-master-key-1-master-key-1", "whsec_abc")
    expect(stored.startsWith("v1.")).toBe(true)
    expect(stored).not.toContain("whsec_abc")
    expect(await decryptSecret("master-key-1-master-key-1-master-key-1", stored)).toBe("whsec_abc")
    await expect(decryptSecret("master-key-2-master-key-2-master-key-2", stored)).rejects.toThrow()
    expect(await encryptSecret("m".repeat(32), "x")).not.toBe(
      await encryptSecret("m".repeat(32), "x"),
    )
  })
})

describe("URL safety", () => {
  test("private, loopback, link-local/metadata, CGNAT and friends are blocked", () => {
    for (const ip of [
      "10.1.2.3",
      "127.0.0.1",
      "169.254.169.254",
      "172.20.0.1",
      "192.168.1.1",
      "100.64.0.1",
      "0.0.0.0",
      "::1",
      "fd00::1",
      "fe80::1",
      "::ffff:10.0.0.1",
      "not-an-ip",
    ])
      expect({ ip, blocked: isPrivateAddress(ip) }).toEqual({ ip, blocked: true })
    for (const ip of ["41.90.1.2", "8.8.8.8", "172.32.0.1", "2c0f:fe38::1", "::ffff:41.90.1.2"])
      expect({ ip, blocked: isPrivateAddress(ip) }).toEqual({ ip, blocked: false })
  })

  test("checkWebhookUrl: https public hosts only (unless allowPrivate)", () => {
    expect(checkWebhookUrl("https://hooks.example.co.ke/sahihi#x")).toMatchObject({ ok: true })
    const ok = checkWebhookUrl("https://hooks.example.co.ke/sahihi#x")
    if (ok.ok) expect(ok.url.toString()).toBe("https://hooks.example.co.ke/sahihi")
    for (const bad of [
      "http://hooks.example.co.ke/x",
      "https://user:pw@hooks.example.co.ke/x",
      "https://localhost/x",
      "https://127.0.0.1/x",
      "https://169.254.169.254/latest/meta-data",
      "https://[::1]/x",
      "https://intranet/x",
      "https://db.internal/x",
      "ftp://example.com/x",
      "not a url",
    ])
      expect({ bad, ok: checkWebhookUrl(bad).ok }).toEqual({ bad, ok: false })
    expect(checkWebhookUrl("http://localhost:4100/hook", { allowPrivate: true }).ok).toBe(true)
  })
})

describe("schemas, retries, payloads", () => {
  test("events are required and de-duplicated", () => {
    expect(CreateWebhookSchema.safeParse({ url: "https://x.co", events: [] }).success).toBe(false)
    expect(
      CreateWebhookSchema.parse({ url: "https://x.co", events: ["envelope.sent", "envelope.sent"] })
        .events,
    ).toEqual(["envelope.sent"])
    expect(
      CreateWebhookSchema.safeParse({ url: "https://x.co", events: ["user.deleted"] }).success,
    ).toBe(false)
  })

  test("retry schedule backs off, then settles at 6 h", () => {
    expect([1, 2, 3, 4, 5, 6, 9].map(webhookRetryDelayMs)).toEqual([
      30_000, 120_000, 480_000, 1_800_000, 3_600_000, 21_600_000, 21_600_000,
    ])
  })

  test("envelope payload: snapshot of the envelope, dates as ISO strings, no secrets", () => {
    const at = new Date("2026-09-29T08:00:00Z")
    const data = envelopeEventData({
      id: "env_1",
      title: "Lease",
      status: "COMPLETED",
      signingOrder: "PARALLEL",
      createdAt: at,
      sentAt: at,
      completedAt: at,
      voidedAt: null,
      voidReason: null,
      documents: [
        {
          order: 1,
          signedSha256: "d".repeat(64),
          document: { id: "doc_2", name: "annex.pdf", sha256: "c".repeat(64) },
        },
        {
          order: 0,
          signedSha256: "b".repeat(64),
          document: { id: "doc_1", name: "lease.pdf", sha256: "a".repeat(64) },
        },
      ],
      attachments: [
        { name: "prices.xlsx", sha256: "e".repeat(64), status: "READY" },
        { name: "half.png", sha256: null, status: "UPLOADING" },
      ],
      certificate: { code: "K7QM-2XDP-9RTA" },
      recipients: [
        {
          id: "r1",
          name: "Otieno",
          email: "o@example.test",
          role: "SIGNER",
          order: 1,
          status: "SIGNED",
          signedAt: at,
          declinedAt: null,
          declineReason: null,
        },
      ],
    })
    expect(data.envelope.certificateCode).toBe("K7QM-2XDP-9RTA")
    // Documents in signing order; the legacy single-document fields are the first one's.
    expect(data.envelope.documents.map((d) => d.name)).toEqual(["lease.pdf", "annex.pdf"])
    expect(data.envelope.document?.name).toBe("lease.pdf")
    expect(data.envelope.signedSha256).toBe("b".repeat(64))
    expect(data.envelope.attachments).toEqual([{ name: "prices.xlsx", sha256: "e".repeat(64) }])
    expect(data.envelope.recipients[0]?.signedAt).toBe("2026-09-29T08:00:00.000Z")
    const json = JSON.stringify(data)
    for (const secretish of ["token", "Hash", "otp", "ipAddress", "signedIp"])
      expect(json).not.toContain(secretish)
    expect(
      JSON.parse(
        webhookBody({
          id: "evt",
          type: "envelope.completed",
          createdAt: at,
          organizationId: "org",
          data,
        }),
      ),
    ).toMatchObject({
      id: "evt",
      type: "envelope.completed",
      organizationId: "org",
    })
  })
})
