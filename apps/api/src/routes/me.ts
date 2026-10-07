import {
  AvatarSchema,
  avatarProblem,
  avatarUrl,
  SAVED_SIGNATURE_KINDS,
  type SavedSignatureKind,
  SaveSignatureSchema,
} from "@sahihi/core"
import { prisma } from "@sahihi/db"
import { createLogger, deleteObject, getObjectBytes, keys, putObject } from "@sahihi/infra"
import { pngFromDataUrl } from "@sahihi/pdf"
import { Hono } from "hono"
import type { AppEnv } from "../lib/env"
import { badRequest, notFound, parseJson } from "../lib/http"
import { requireUser } from "../middleware/session"

/**
 * The signed-in user's own account data (docs/auth.md → Account settings). better-auth serves the
 * rest (name, email, password, 2FA, sessions) under /api/auth. Nothing here is workspace data, so
 * no active organization is needed, and every query is keyed by the caller's user id.
 */
const log = createLogger("me")

const column = { signature: "signatureKey", initials: "initialsKey" } as const

async function toDataUrl(key: string | null): Promise<string | null> {
  if (!key) return null
  try {
    return `data:image/png;base64,${Buffer.from(await getObjectBytes(key)).toString("base64")}`
  } catch (err) {
    log.warn("saved signature missing from storage", { err })
    return null
  }
}

export const me = new Hono<AppEnv>()
  .use(requireUser)

  /**
   * Saved signature and initials as PNG data URLs: the signing page adopts them like a freshly
   * drawn signature, so nothing else about submitting changes.
   */
  .get("/signatures", async (c) => {
    const user = c.get("user")
    const row = await prisma.savedSignature.findUnique({ where: { userId: user.id } })
    const [signature, initials] = await Promise.all([
      toDataUrl(row?.signatureKey ?? null),
      toDataUrl(row?.initialsKey ?? null),
    ])
    // The email lets the signing page check the envelope is addressed to this user.
    return c.json({ email: user.email, signature, initials, updatedAt: row?.updatedAt ?? null })
  })

  .put("/signatures", async (c) => {
    const { kind, dataUrl } = await parseJson(c, SaveSignatureSchema)
    let png: Uint8Array
    try {
      png = pngFromDataUrl(dataUrl)
    } catch {
      badRequest("The signature must be a valid PNG")
    }
    const userId = c.get("user").id
    const key = keys.savedSignature(userId, kind, crypto.randomUUID().slice(0, 8))
    await putObject(key, png, "image/png")
    const previous = await prisma.savedSignature.findUnique({ where: { userId } })
    await prisma.savedSignature.upsert({
      where: { userId },
      create: { userId, [column[kind]]: key },
      update: { [column[kind]]: key },
    })
    const old = previous?.[column[kind]]
    if (old) await deleteObject(old).catch((err) => log.warn("old signature not deleted", { err }))
    return c.json({ kind, dataUrl })
  })

  .delete("/signatures/:kind", async (c) => {
    const kind = c.req.param("kind") as SavedSignatureKind
    if (!SAVED_SIGNATURE_KINDS.includes(kind)) notFound("Signature")
    const userId = c.get("user").id
    const row = await prisma.savedSignature.findUnique({ where: { userId } })
    const key = row?.[column[kind]]
    if (!row || !key) return c.body(null, 204)
    await prisma.savedSignature.update({ where: { userId }, data: { [column[kind]]: null } })
    await deleteObject(key).catch((err) => log.warn("signature not deleted", { err }))
    return c.body(null, 204)
  })

  /**
   * Profile picture: a square PNG cropped in the browser. `User.image` gets its same-origin URL
   * (served by routes/avatars.ts), so the account menu and members table need no changes.
   */
  .put("/avatar", async (c) => {
    const { dataUrl } = await parseJson(c, AvatarSchema)
    let png: Uint8Array
    try {
      png = pngFromDataUrl(dataUrl)
    } catch {
      badRequest("The picture must be a PNG image")
    }
    const problem = avatarProblem(png)
    if (problem) badRequest(problem)

    const userId = c.get("user").id
    const version = crypto.randomUUID().slice(0, 8)
    const key = keys.avatar(userId, version)
    await putObject(key, png, "image/png")
    const image = avatarUrl(userId, version)
    const previous = await prisma.$transaction(async (tx) => {
      const before = await tx.userAvatar.findUnique({ where: { userId }, select: { key: true } })
      await tx.userAvatar.upsert({ where: { userId }, create: { userId, key }, update: { key } })
      await tx.user.update({ where: { id: userId }, data: { image } })
      return before?.key ?? null
    })
    if (previous) await deleteObject(previous).catch((err) => log.warn("old avatar kept", { err }))
    return c.json({ image })
  })

  .delete("/avatar", async (c) => {
    const userId = c.get("user").id
    const previous = await prisma.$transaction(async (tx) => {
      const before = await tx.userAvatar.findUnique({ where: { userId }, select: { key: true } })
      if (before) await tx.userAvatar.delete({ where: { userId } })
      await tx.user.update({ where: { id: userId }, data: { image: null } })
      return before?.key ?? null
    })
    if (previous) await deleteObject(previous).catch((err) => log.warn("avatar kept", { err }))
    return c.body(null, 204)
  })
