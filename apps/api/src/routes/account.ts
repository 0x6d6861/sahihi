import { ConfirmAccountDeletionSchema, hashDeletionToken } from "@sahihi/core"
import { prisma } from "@sahihi/db"
import { createLogger, getQueues } from "@sahihi/infra"
import { Hono } from "hono"
import { deletionBlockersFor, deletionIdentifier, eraseUser } from "../lib/account-deletion"
import type { AppEnv } from "../lib/env"
import { conflict, notFound, parseJson } from "../lib/http"
import { rateLimit } from "../middleware/rate-limit"

const log = createLogger("account")

/**
 * Public account routes: the emailed link is the proof, so no session is needed (the person may
 * open it on another device). Rate-limited like every public route (docs/security.md).
 */
export const account = new Hono<AppEnv>()
  .use(rateLimit({ bucket: "account", limit: 10, windowSec: 60 }))

  /**
   * Step 2 of deleting an account (ADR 0040): erase it. The link works once and for an hour. The
   * last-owner check runs again, since memberships may have changed since the email.
   */
  .post("/delete", async (c) => {
    const { token } = await parseJson(c, ConfirmAccountDeletionSchema)
    const pending = await prisma.verification.findFirst({
      where: {
        identifier: deletionIdentifier(await hashDeletionToken(token)),
        expiresAt: { gt: new Date() },
      },
      select: { value: true },
    })
    if (!pending) notFound("Deletion link")
    const userId = pending.value

    const blockers = await deletionBlockersFor(userId)
    if (blockers.length > 0) {
      conflict(
        `You're now the only owner of ${blockers.map((b) => b.name).join(", ")}. Make someone else an owner, or delete the workspace, first.`,
      )
    }

    if (await eraseUser(userId)) {
      await getQueues().maintenance.add(
        "user.purge-storage",
        { userId },
        { jobId: `purge-user-${userId}`, attempts: 5 },
      )
      log.info("account deleted", { userId })
    }
    return c.json({ deleted: true })
  })
