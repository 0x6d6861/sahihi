import { getEnv } from "@sahihi/config"
import {
  assertTransition,
  CONSENT_VERSION,
  consentTextSha256,
  DeclineSigningSchema,
  deriveOutcome,
  downloadFileName,
  type FieldValueInput,
  generateOtp,
  hashOtp,
  hashSigningToken,
  isRecipientsTurn,
  isTerminal,
  OTP_RESEND_COOLDOWN_MS,
  otpResendWaitSec,
  SubmitSigningSchema,
  timingSafeEqual,
  VerifyOtpSchema,
} from "@sahihi/core"
import { appendAuditEvent, prisma, queueEnvelopeWebhook } from "@sahihi/db"
import { activateNextRecipients } from "@sahihi/envelopes"
import {
  enqueueWebhookDeliveries,
  getQueues,
  keys,
  presignDownload,
  putObject,
} from "@sahihi/infra"
import { pngFromDataUrl } from "@sahihi/pdf"
import { type Context, Hono } from "hono"
import { getSignedCookie, setSignedCookie } from "hono/cookie"
import { createMiddleware } from "hono/factory"
import { HTTPException } from "hono/http-exception"
import { badRequest, clientMeta, conflict, parseJson } from "../lib/http"
import { rateLimit } from "../middleware/rate-limit"

/**
 * PUBLIC signing API — authenticated ONLY by the recipient token in the URL
 * (+ OTP cookie when the recipient's verification method requires it).
 * No better-auth session is involved. Read docs/signing-flow.md and
 * docs/security.md before changing anything here.
 */

const TOKEN_RE = /^[A-Za-z0-9_-]{43}$/
const OTP_TTL_MS = 10 * 60_000
const OTP_MAX_ATTEMPTS = 5
const VERIFIED_COOKIE = "sahihi_signer"
const VERIFIED_TTL_SEC = 30 * 60

async function loadByToken(token: string) {
  if (!TOKEN_RE.test(token)) return null
  return prisma.recipient.findUnique({
    where: { tokenHash: await hashSigningToken(token) },
    include: {
      envelope: {
        include: {
          organization: { select: { name: true, logo: true } },
          createdBy: { select: { name: true, email: true } },
          document: { select: { name: true, pageCount: true, pages: true, s3Key: true } },
          recipients: { select: { id: true, role: true, order: true, status: true } },
          certificate: { select: { s3Key: true, code: true } },
        },
      },
    },
  })
}
type Signer = NonNullable<Awaited<ReturnType<typeof loadByToken>>>
type SigningEnv = { Variables: { signer: Signer } }

type LinkState = "ready" | "waiting" | "signed" | "completed" | "declined" | "expired" | "closed"

function linkState(s: Signer): LinkState {
  if (s.tokenExpiresAt && s.tokenExpiresAt < new Date()) return "expired"
  if (s.envelope.status === "COMPLETED") return "completed"
  if (s.status === "SIGNED") return "signed"
  if (s.status === "DECLINED") return "declined"
  if (s.envelope.status === "EXPIRED" || (s.tokenExpiresAt && s.tokenExpiresAt < new Date()))
    return "expired"
  if (isTerminal(s.envelope.status)) return "closed"
  if (!isRecipientsTurn(s, s.envelope.recipients, s.envelope.signingOrder)) return "waiting"
  return "ready"
}

const cookieSecret = () => `${getEnv().BETTER_AUTH_SECRET}:signer-cookie`

async function isVerified(c: Context, s: Signer) {
  if (s.verification === "LINK") return true
  const value = await getSignedCookie(c, cookieSecret(), VERIFIED_COOKIE)
  if (!value) return false
  const [recipientId, exp] = value.split(".")
  return recipientId === s.id && Number(exp) > Date.now()
}

const maskEmail = (e: string) =>
  e.replace(
    /^(.)(.*)(@.*)$/,
    (_, a, b: string, d) => `${a}${"•".repeat(Math.min(b.length, 6))}${d}`,
  )
const maskPhone = (p: string | null) => (p ? `${p.slice(0, 4)}•••${p.slice(-3)}` : null)

/**
 * Origins allowed to frame this signing page: the workspace's embed origins, only for an
 * EMBEDDED recipient (docs/embedded-signing.md). Email recipients can never be framed.
 */
async function embedOriginsFor(s: Signer): Promise<string[]> {
  if (s.delivery !== "EMBEDDED") return []
  const settings = await prisma.workspaceSettings.findUnique({
    where: { organizationId: s.envelope.organizationId },
    select: { embedOrigins: true },
  })
  return settings?.embedOrigins ?? []
}

/** Resolves the recipient from :token or responds 404. */
const withSigner = createMiddleware<SigningEnv>(async (c, next) => {
  const signer = await loadByToken(c.req.param("token") ?? "")
  if (!signer) return c.json({ error: "invalid_link" }, 404)
  c.set("signer", signer)
  await next()
})

/** Requires link state "ready" (+ OTP if configured). */
const requireReady = createMiddleware<SigningEnv>(async (c, next) => {
  const s = c.get("signer")
  const state = linkState(s)
  if (state !== "ready") return c.json({ error: "link_not_active", state }, 409)
  if (!(await isVerified(c, s))) return c.json({ error: "verification_required" }, 401)
  await next()
})

export const signing = new Hono<SigningEnv>()
  .use("/:token/*", rateLimit({ bucket: "sign", limit: 120, windowSec: 60 }))
  .use("/:token", rateLimit({ bucket: "sign", limit: 120, windowSec: 60 }))

  .get("/:token", withSigner, async (c) => {
    const s = c.get("signer")
    const state = linkState(s)
    const verified = await isVerified(c, s)
    const e = s.envelope
    const fields =
      state === "ready" && verified
        ? await prisma.field.findMany({
            where: { recipientId: s.id },
            select: {
              id: true,
              type: true,
              page: true,
              x: true,
              y: true,
              width: true,
              height: true,
              required: true,
              label: true,
            },
            orderBy: [{ page: "asc" }, { y: "asc" }],
          })
        : []
    return c.json({
      state,
      requiresVerification: !verified,
      envelope: {
        title: e.title,
        message: e.message,
        organization: e.organization,
        sender: e.createdBy,
        expiresAt: e.expiresAt,
      },
      recipient: {
        name: s.name,
        // Full email only after verification; masked values are always available
        email: verified ? s.email : null,
        role: s.role,
        verification: s.verification,
        maskedEmail: maskEmail(s.email),
        maskedPhone: maskPhone(s.phone),
      },
      document: {
        name: e.document.name,
        pageCount: e.document.pageCount,
        pages: verified ? e.document.pages : null,
      },
      fields,
      downloadsAvailable: state === "completed" && Boolean(e.signedS3Key && e.certificate),
      // Embedded recipients: where the page may post its events (and be framed from).
      embed: s.delivery === "EMBEDDED" ? { origins: await embedOriginsFor(s) } : null,
      certificateCode: state === "completed" ? (e.certificate?.code ?? null) : null,
    })
  })

  /** Frame policy for /sign/<token>?embed=1, read by the web's proxy.ts to set frame-ancestors. */
  .get("/:token/embed", withSigner, async (c) =>
    c.json({ origins: await embedOriginsFor(c.get("signer")) }),
  )

  /** After completion, every recipient receives a fresh link that lands here. */
  .get("/:token/downloads", withSigner, async (c) => {
    const s = c.get("signer")
    if (s.envelope.purgedAt) {
      return c.json(
        { error: "purged", message: "These files were deleted under the data retention policy" },
        410,
      )
    }
    if (linkState(s) !== "completed" || !s.envelope.signedS3Key || !s.envelope.certificate) {
      return c.json({ error: "not_available" }, 409)
    }
    return c.json({
      signed: await presignDownload(s.envelope.signedS3Key, {
        fileName: downloadFileName(s.envelope.title, "signed"),
        disposition: "attachment",
      }),
      certificate: await presignDownload(s.envelope.certificate.s3Key, {
        fileName: downloadFileName(s.envelope.title, "certificate"),
        disposition: "attachment",
      }),
    })
  })

  .post(
    "/:token/otp",
    withSigner,
    rateLimit({
      bucket: "otp-send",
      limit: 5,
      windowSec: 15 * 60,
      key: (c) => c.req.param("token") ?? "",
    }),
    async (c) => {
      const s = c.get("signer")
      if (linkState(s) !== "ready") conflict("Link is not active")
      if (s.verification === "LINK") badRequest("No verification required")
      // Server-side resend cooldown: the UI counts down too, but SMS costs money per send.
      const last = await prisma.recipientOtp.findFirst({
        where: { recipientId: s.id },
        orderBy: { createdAt: "desc" },
        select: { createdAt: true },
      })
      const wait = otpResendWaitSec(last?.createdAt ?? null)
      if (wait > 0) {
        c.header("Retry-After", String(wait))
        return c.json(
          {
            error: "otp_cooldown",
            message: `Please wait ${wait}s before requesting another code`,
            retryAfterSec: wait,
          },
          429,
        )
      }
      const channel = s.verification
      const code = generateOtp()
      await prisma.$transaction(async (tx) => {
        await tx.recipientOtp.create({
          data: {
            recipientId: s.id,
            channel,
            codeHash: await hashOtp(s.id, code),
            expiresAt: new Date(Date.now() + OTP_TTL_MS),
          },
        })
        await appendAuditEvent(tx, {
          envelopeId: s.envelopeId,
          type: "recipient.otp_sent",
          recipientId: s.id,
          data: { channel },
          ...clientMeta(c),
        })
      })
      await getQueues().notifications.add("recipient.otp", { recipientId: s.id, code, channel })
      return c.json({
        sentTo: channel === "SMS_OTP" ? maskPhone(s.phone) : maskEmail(s.email),
        resendAfterSec: OTP_RESEND_COOLDOWN_MS / 1000,
      })
    },
  )

  .post("/:token/otp/verify", withSigner, async (c) => {
    const s = c.get("signer")
    const { code } = await parseJson(c, VerifyOtpSchema)
    const otp = await prisma.recipientOtp.findFirst({
      where: { recipientId: s.id, consumedAt: null, expiresAt: { gt: new Date() } },
      orderBy: { createdAt: "desc" },
    })
    if (!otp) badRequest("Code expired — request a new one")
    // Claim one attempt atomically BEFORE comparing. A read-then-increment would let parallel
    // requests all see the same count and guess far more than OTP_MAX_ATTEMPTS times.
    const claimed = await prisma.recipientOtp.updateMany({
      where: { id: otp.id, consumedAt: null, attempts: { lt: OTP_MAX_ATTEMPTS } },
      data: { attempts: { increment: 1 } },
    })
    if (claimed.count === 0) throw new HTTPException(429, { message: "Too many attempts" })

    const ok = timingSafeEqual(otp.codeHash, await hashOtp(s.id, code))
    await prisma.$transaction(async (tx) => {
      if (ok) {
        await tx.recipientOtp.update({ where: { id: otp.id }, data: { consumedAt: new Date() } })
      }
      await appendAuditEvent(tx, {
        envelopeId: s.envelopeId,
        type: ok ? "recipient.otp_verified" : "recipient.otp_failed",
        recipientId: s.id,
        data: { channel: otp.channel },
        ...clientMeta(c),
      })
    })
    if (!ok) badRequest("Incorrect code")

    await setSignedCookie(
      c,
      VERIFIED_COOKIE,
      `${s.id}.${Date.now() + VERIFIED_TTL_SEC * 1000}`,
      cookieSecret(),
      {
        httpOnly: true,
        secure: getEnv().NODE_ENV === "production",
        sameSite: "Lax",
        path: "/api/sign",
        maxAge: VERIFIED_TTL_SEC,
      },
    )
    return c.json({ ok: true })
  })

  /** Presigned URL for the ORIGINAL document. First call marks the recipient VIEWED. */
  .get("/:token/file", withSigner, requireReady, async (c) => {
    const s = c.get("signer")
    if (s.status === "SENT") {
      await prisma.$transaction(async (tx) => {
        await tx.recipient.update({
          where: { id: s.id },
          data: { status: "VIEWED", viewedAt: new Date() },
        })
        if (s.envelope.status === "SENT") {
          await tx.envelope.update({ where: { id: s.envelopeId }, data: { status: "IN_PROGRESS" } })
        }
        await appendAuditEvent(tx, {
          envelopeId: s.envelopeId,
          type: "recipient.viewed",
          recipientId: s.id,
          ...clientMeta(c),
        })
      })
    }
    return c.json({
      url: await presignDownload(s.envelope.document.s3Key, { fileName: s.envelope.document.name }),
    })
  })

  .post("/:token/submit", withSigner, requireReady, async (c) => {
    const s = c.get("signer")
    const input = await parseJson(c, SubmitSigningSchema)
    // The signer must have agreed to the wording in force now (e.g. not a page loaded before a
    // deploy changed it). Checked before anything is stored.
    if (input.consentVersion !== CONSENT_VERSION) {
      return c.json(
        {
          error: "consent_outdated",
          message: "The consent text has changed",
          consentVersion: CONSENT_VERSION,
        },
        409,
      )
    }
    const consent = {
      consentVersion: CONSENT_VERSION,
      consentTextSha256: await consentTextSha256(CONSENT_VERSION),
    }
    const fields = await prisma.field.findMany({ where: { recipientId: s.id } })
    const byId = new Map<string, FieldValueInput>(input.values.map((v) => [v.fieldId, v]))
    for (const id of byId.keys())
      if (!fields.some((f) => f.id === id)) badRequest(`Unknown field ${id}`)

    // ── Resolve every field's final value; server fills automatic fields ──
    const today = new Date().toISOString().slice(0, 10)
    const missing: string[] = []
    const updates: { id: string; value: string | null; imageS3Key: string | null }[] = []
    for (const f of fields) {
      const v = byId.get(f.id)
      switch (f.type) {
        case "SIGNATURE":
        case "INITIALS": {
          if (v?.kind !== "image") {
            if (f.required) missing.push(f.id)
            break
          }
          let png: Uint8Array
          try {
            png = pngFromDataUrl(v.dataUrl)
          } catch {
            badRequest(`Field ${f.id}: signature must be a valid PNG`)
          }
          const key = keys.fieldImage(s.envelope.organizationId, s.envelopeId, f.id)
          await putObject(key, png, "image/png")
          updates.push({ id: f.id, value: null, imageS3Key: key })
          break
        }
        case "CHECKBOX": {
          const checked = v?.kind === "checkbox" && v.checked
          if (f.required && !checked) missing.push(f.id)
          updates.push({ id: f.id, value: String(checked), imageS3Key: null })
          break
        }
        case "TEXT": {
          const text = v?.kind === "text" ? v.value.trim() : ""
          if (f.required && !text) missing.push(f.id)
          updates.push({ id: f.id, value: text || null, imageS3Key: null })
          break
        }
        case "DATE_SIGNED":
          updates.push({ id: f.id, value: today, imageS3Key: null })
          break
        case "NAME":
          updates.push({ id: f.id, value: s.name, imageS3Key: null })
          break
        case "EMAIL":
          updates.push({ id: f.id, value: s.email, imageS3Key: null })
          break
      }
    }
    if (missing.length) {
      return c.json({ error: "missing_required_fields", fieldIds: missing }, 400)
    }

    const meta = clientMeta(c)
    const result = await prisma.$transaction(async (tx) => {
      // Guarded update prevents double-submits
      const claimed = await tx.recipient.updateMany({
        where: { id: s.id, status: { in: ["SENT", "VIEWED"] } },
        data: {
          status: "SIGNED",
          signedAt: new Date(),
          consentedAt: new Date(),
          viewedAt: s.viewedAt ?? new Date(),
          signedIp: meta.ipAddress,
          signedUserAgent: meta.userAgent,
        },
      })
      if (claimed.count === 0) conflict("Already submitted")

      const now = new Date()
      for (const u of updates) {
        await tx.field.update({
          where: { id: u.id },
          data: { value: u.value, imageS3Key: u.imageS3Key, filledAt: now },
        })
      }
      await appendAuditEvent(tx, {
        envelopeId: s.envelopeId,
        type: "recipient.consented",
        recipientId: s.id,
        data: consent,
        ...meta,
      })
      await appendAuditEvent(tx, {
        envelopeId: s.envelopeId,
        type: "recipient.signed",
        recipientId: s.id,
        data: { fields: updates.length },
        ...meta,
      })

      const recipients = await tx.recipient.findMany({
        where: { envelopeId: s.envelopeId },
        select: { id: true, role: true, order: true, status: true },
      })
      const outcome = deriveOutcome(recipients)
      if (outcome === "COMPLETED") {
        assertTransition(s.envelope.status === "SENT" ? "SENT" : "IN_PROGRESS", "COMPLETED")
        await tx.envelope.update({
          where: { id: s.envelopeId },
          data: { status: "COMPLETED", completedAt: new Date() },
        })
        await appendAuditEvent(tx, { envelopeId: s.envelopeId, type: "envelope.completed" })
      } else if (s.envelope.status === "SENT") {
        await tx.envelope.update({ where: { id: s.envelopeId }, data: { status: "IN_PROGRESS" } })
      }
      // envelope.completed is emitted by finalize, once the signed PDF and certificate exist.
      const webhooks = await queueEnvelopeWebhook(tx, {
        envelopeId: s.envelopeId,
        type: "recipient.signed",
        extra: { recipientId: s.id },
      })
      const links = outcome === "COMPLETED" ? [] : await activateNextRecipients(tx, s.envelopeId)
      return { outcome, links, webhooks }
    })

    const q = getQueues()
    if (result.outcome === "COMPLETED") {
      await q.finalize.add(
        "envelope.finalize",
        { envelopeId: s.envelopeId },
        // BullMQ custom ids may not contain ":". Same id twice = one job (dedupe).
        { jobId: `finalize-${s.envelopeId}` },
      )
    }
    await Promise.all(result.links.map((l) => q.notifications.add("envelope.invite", l)))
    await enqueueWebhookDeliveries(result.webhooks)
    return c.json({ ok: true, envelopeStatus: result.outcome })
  })

  .post("/:token/decline", withSigner, requireReady, async (c) => {
    const s = c.get("signer")
    const { reason } = await parseJson(c, DeclineSigningSchema)
    const webhooks = await prisma.$transaction(async (tx) => {
      const claimed = await tx.recipient.updateMany({
        where: { id: s.id, status: { in: ["SENT", "VIEWED"] } },
        data: { status: "DECLINED", declinedAt: new Date(), declineReason: reason },
      })
      if (claimed.count === 0) conflict("Already submitted")
      assertTransition(s.envelope.status, "DECLINED")
      await tx.envelope.update({ where: { id: s.envelopeId }, data: { status: "DECLINED" } })
      await tx.recipient.updateMany({
        where: { envelopeId: s.envelopeId, id: { not: s.id } },
        data: { tokenHash: null },
      })
      await appendAuditEvent(tx, {
        envelopeId: s.envelopeId,
        type: "recipient.declined",
        recipientId: s.id,
        data: { reason },
        ...clientMeta(c),
      })
      await appendAuditEvent(tx, { envelopeId: s.envelopeId, type: "envelope.declined" })
      return queueEnvelopeWebhook(tx, {
        envelopeId: s.envelopeId,
        type: "envelope.declined",
        extra: { recipientId: s.id },
      })
    })
    await getQueues().notifications.add("envelope.declined", {
      envelopeId: s.envelopeId,
      recipientId: s.id,
    })
    await enqueueWebhookDeliveries(webhooks)
    return c.json({ ok: true })
  })
