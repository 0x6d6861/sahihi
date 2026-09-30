import { beforeEach, describe, expect, test } from "bun:test"
import { prisma } from "@sahihi/db"
import { getQueues } from "@sahihi/infra"
import { createSender, request, resetDb, type Sender, uploadDocument } from "./helpers"

let alice: Sender
let token: string
let recipientId: string

/** Raw values only exist in job payloads (never in the DB). Newest matching job wins. */
async function latestJobData<T>(name: string, match: (d: T) => boolean): Promise<T> {
  const jobs = await getQueues().notifications.raw.getJobs(["waiting", "delayed", "active"])
  const hit = jobs
    .filter((j) => j.name === name && match(j.data as T))
    .sort((a, b) => b.timestamp - a.timestamp)[0]
  if (!hit) throw new Error(`no ${name} job`)
  return hit.data as T
}

beforeEach(async () => {
  await resetDb()
  alice = await createSender("alice")
  const { document } = await uploadDocument(alice)
  const created = await request(alice, "/api/envelopes", {
    method: "POST",
    json: { documentId: document.id, title: "OTP test" },
  })
  const envelopeId = ((await created.json()) as { envelope: { id: string } }).envelope.id
  const put = await request(alice, `/api/envelopes/${envelopeId}/recipients`, {
    method: "PUT",
    json: {
      recipients: [{ name: "Otieno", email: "otieno@example.test", verification: "EMAIL_OTP" }],
    },
  })
  const [r] = ((await put.json()) as { recipients: { id: string }[] }).recipients
  if (!r) throw new Error("no recipient")
  recipientId = r.id
  await request(alice, `/api/envelopes/${envelopeId}/fields`, {
    method: "PUT",
    json: {
      fields: [
        { recipientId, type: "SIGNATURE", page: 1, x: 0.1, y: 0.1, width: 0.3, height: 0.06 },
      ],
    },
  })
  const sent = await request(alice, `/api/envelopes/${envelopeId}/send`, { method: "POST" })
  expect(sent.status).toBe(200)
  token = (
    await latestJobData<{ recipientId: string; token: string }>(
      "envelope.invite",
      (d) => d.recipientId === recipientId,
    )
  ).token
})

const sendOtp = () => request(null, `/api/sign/${token}/otp`, { method: "POST" })

describe("POST /sign/:token/otp (resend cooldown)", () => {
  test("first send returns the masked address and the cooldown", async () => {
    const res = await sendOtp()
    expect(res.status).toBe(200)
    const body = (await res.json()) as { sentTo: string; resendAfterSec: number }
    expect(body.resendAfterSec).toBe(30)
    expect(body.sentTo).not.toContain("otieno@example.test")
  })

  test("an immediate resend is refused with Retry-After; after the cooldown it works", async () => {
    expect((await sendOtp()).status).toBe(200)
    const again = await sendOtp()
    expect(again.status).toBe(429)
    expect(Number(again.headers.get("retry-after"))).toBeGreaterThan(0)
    const body = (await again.json()) as { error: string; retryAfterSec: number }
    expect(body.error).toBe("otp_cooldown")
    expect(body.retryAfterSec).toBeLessThanOrEqual(30)
    expect(await prisma.recipientOtp.count({ where: { recipientId } })).toBe(1)

    // Age the last code past the cooldown.
    await prisma.recipientOtp.updateMany({
      where: { recipientId },
      data: { createdAt: new Date(Date.now() - 31_000) },
    })
    expect((await sendOtp()).status).toBe(200)
    expect(await prisma.recipientOtp.count({ where: { recipientId } })).toBe(2)
  })

  test("the emailed code verifies; codes are stored only as hashes", async () => {
    await sendOtp()
    const { code } = await latestJobData<{ recipientId: string; code: string }>(
      "recipient.otp",
      (d) => d.recipientId === recipientId,
    )
    const stored = await prisma.recipientOtp.findFirstOrThrow({ where: { recipientId } })
    expect(stored.codeHash).not.toContain(code)

    const wrong = code === "000000" ? "111111" : "000000"
    const bad = await request(null, `/api/sign/${token}/otp/verify`, {
      method: "POST",
      json: { code: wrong },
    })
    expect(bad.status).toBe(400)
    const ok = await request(null, `/api/sign/${token}/otp/verify`, {
      method: "POST",
      json: { code },
    })
    expect(ok.status).toBe(200)
    expect(ok.headers.get("set-cookie")).toContain("HttpOnly")
  })
})

describe("POST /sign/:token/otp/verify (lockout)", () => {
  /** Own rate-limit bucket per test (the trusted, rightmost X-Forwarded-For entry). */
  const ip = `10.${Math.floor(Math.random() * 250)}.${Math.floor(Math.random() * 250)}.1`
  const verify = (code: string) =>
    request(null, `/api/sign/${token}/otp/verify`, {
      method: "POST",
      json: { code },
      headers: { "x-forwarded-for": ip },
    })

  async function issuedCode() {
    await sendOtp()
    return (
      await latestJobData<{ recipientId: string; code: string }>(
        "recipient.otp",
        (d) => d.recipientId === recipientId,
      )
    ).code
  }

  test("after 5 wrong codes even the right one is refused (429)", async () => {
    const code = await issuedCode()
    const wrong = code === "000000" ? "111111" : "000000"
    for (let i = 0; i < 5; i++) expect((await verify(wrong)).status).toBe(400)
    expect((await verify(code)).status).toBe(429)
  })

  test("parallel guesses can't exceed the attempt cap", async () => {
    const code = await issuedCode()
    const wrong = code === "000000" ? "111111" : "000000"
    const statuses = await Promise.all(Array.from({ length: 20 }, () => verify(wrong)))
    expect(statuses.filter((r) => r.status === 400)).toHaveLength(5)
    expect(statuses.filter((r) => r.status === 429)).toHaveLength(15)
    const otp = await prisma.recipientOtp.findFirstOrThrow({ where: { recipientId } })
    expect(otp.attempts).toBe(5)
  })
})
