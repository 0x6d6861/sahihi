import { getEnv } from "@sahihi/config"
import { contentDisposition, verifyStorageTicket } from "@sahihi/core"
import { CACHEABLE_URL_WINDOW_SECONDS, createLogger, storageFor } from "@sahihi/infra"
import { Hono } from "hono"
import { rateLimit } from "../middleware/rate-limit"

const log = createLogger("api")

/**
 * Files from a workspace's own bucket (docs/storage.md → File access). Public like a presigned
 * URL: the signed, expiring ticket is the permission, and it names one object of one workspace.
 * The browser stays on our origin (the CSP keeps one storage origin, the customer needs no CORS)
 * and never learns the bucket's address. Anything wrong answers 404, revealing nothing.
 */
export const storageObjects = new Hono()
  // Thumbnail grids load many at once; generous, but bounded.
  .use(rateLimit({ bucket: "storage-objects", limit: 600, windowSec: 60 }))

  .get("/:ticket", async (c) => {
    const ticket = await verifyStorageTicket(getEnv().BETTER_AUTH_SECRET, c.req.param("ticket"))
    if (!ticket) return c.json({ error: "not_found" }, 404)
    let object: Awaited<ReturnType<Awaited<ReturnType<typeof storageFor>>["getStream"]>>
    try {
      object = await (await storageFor(ticket.o)).getStream(ticket.k)
    } catch (err) {
      log.warn("storage object not served", { organizationId: ticket.o, err })
      return c.json({ error: "storage_unavailable" }, 502)
    }
    if (!object) return c.json({ error: "not_found" }, 404)
    // Attachments are never inline (no file may render in our origin); PDFs and images may be.
    const type = object.contentType ?? "application/octet-stream"
    const inline = ticket.d !== "a" && /^(application\/pdf|image\/(png|jpeg))$/.test(type)
    c.header("Content-Type", inline ? type : "application/octet-stream")
    if (object.sizeBytes !== null) c.header("Content-Length", String(object.sizeBytes))
    c.header(
      "Content-Disposition",
      contentDisposition(ticket.f ?? "file", inline ? "inline" : "attachment"),
    )
    c.header(
      "Cache-Control",
      ticket.c ? `private, max-age=${CACHEABLE_URL_WINDOW_SECONDS}` : "private, no-store",
    )
    c.header("X-Content-Type-Options", "nosniff")
    return c.body(object.body)
  })
