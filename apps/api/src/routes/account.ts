import { ConfirmAccountDeletionSchema, hashDeletionToken } from "@sahihi/core"
import { prisma } from "@sahihi/db"
import { createLogger, getQueues } from "@sahihi/infra"
import { Hono } from "hono"
import { deletionIdentifier, eraseUser } from "../lib/account-deletion"
import type { AppEnv } from "../lib/env"
import { notFound, parseJson } from "../lib/http"
import { rateLimit } from "../middleware/rate-limit"

const log = createLogger("account")

/**
 * Public account routes: the emailed link is the proof, so no session is needed (the person may
 * open it on another device). Rate-limited like every public route (docs/security.md).
 */
export const account = new Hono<AppEnv>()
  .use(rateLimit({ bucket: "account", limit: 10, windowSec: 60 }))

  /**
   * Step 2 of deleting an account (ADR 0040): erase it. The link works once and for an hour.
   * `eraseUser` runs the last-owner check again, under a lock, since memberships may have changed.
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

    if (await eraseUser(userId)) {
      log.info("account deleted", { userId })
      // The account is already erased and the link used: a queue failure must not turn that into
      // an error. The files under user/<id>/ then stay until someone re-queues the purge.
      await getQueues()
        .maintenance.add(
          "user.purge-storage",
          { userId },
          { jobId: `purge-user-${userId}`, attempts: 5 },
        )
        .catch((err) => log.error("user.purge-storage not queued", { userId, err }))
    }
    return c.json({ deleted: true })
  })
