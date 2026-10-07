import { prisma } from "@sahihi/db"
import { getObjectBytes } from "@sahihi/infra"
import { Hono } from "hono"
import type { AppEnv } from "../lib/env"
import { requireUser } from "../middleware/session"

/**
 * Profile pictures (docs/auth.md → Account settings). A photo is personal data, so unlike workspace
 * logos it isn't public: only the user and people who share a workspace with them may load it.
 * Anyone else gets the same 404 as a user without a picture.
 */
export const avatars = new Hono<AppEnv>()
  .use(requireUser)

  .get("/:userId", async (c) => {
    const viewerId = c.get("user").id
    const userId = c.req.param("userId")
    if (userId !== viewerId) {
      const shared = await prisma.member.findFirst({
        where: {
          userId,
          organization: { members: { some: { userId: viewerId } } },
        },
        select: { id: true },
      })
      if (!shared) return c.json({ error: "not_found" }, 404)
    }
    const avatar = await prisma.userAvatar.findUnique({ where: { userId }, select: { key: true } })
    if (!avatar) return c.json({ error: "not_found" }, 404)
    let bytes: Uint8Array
    try {
      bytes = await getObjectBytes(avatar.key)
    } catch {
      return c.json({ error: "not_found" }, 404)
    }
    // The URL is versioned (`?v=`), so browsers may keep it; shared caches may not (it's personal).
    return c.body(bytes as Uint8Array<ArrayBuffer>, 200, {
      "Content-Type": "image/png",
      "Cache-Control": "private, max-age=86400",
      "Content-Security-Policy": "default-src 'none'",
    })
  })
