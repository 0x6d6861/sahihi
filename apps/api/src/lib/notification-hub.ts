import { createListenClient, NOTIFICATIONS_CHANNEL } from "@sahihi/db"
import { createLogger } from "@sahihi/infra"
import { createFanout } from "./notification-fanout"

const log = createLogger("notification-hub")

const fanout = createFanout()
let started = false
let retryMs = 1_000

/**
 * One `LISTEN` connection per API process, opened with the first stream and kept. Once listening
 * (at first, and after it dropped and reconnected with backoff) it tells every stream to re-read,
 * so a signal sent before or between connections isn't lost.
 */
async function listen() {
  const client = createListenClient()
  let down = false
  const retry = (err?: unknown) => {
    if (down) return
    down = true
    log.warn("notification listener lost, reconnecting", { err, retryMs })
    client.removeAllListeners()
    client.on("error", () => {})
    void client.end().catch(() => {})
    setTimeout(() => void listen(), retryMs)
    retryMs = Math.min(retryMs * 2, 30_000)
  }
  client.on("error", retry)
  client.on("end", () => retry())
  client.on("notification", (msg) => {
    if (msg.channel === NOTIFICATIONS_CHANNEL && msg.payload) fanout.dispatch(msg.payload)
  })
  try {
    await client.connect()
    await client.query(`LISTEN ${NOTIFICATIONS_CHANNEL}`)
    retryMs = 1_000
    fanout.dispatchAll()
  } catch (err) {
    retry(err)
  }
}

/**
 * Calls `fn` whenever the user's notifications in the workspace change. Returns the unsubscribe
 * function, or null when they already hold `MAX_STREAMS_PER_USER` streams.
 */
export function subscribeToNotifications(
  organizationId: string,
  userId: string,
  fn: () => void,
): (() => void) | null {
  const unsubscribe = fanout.subscribe(`${organizationId}:${userId}`, fn)
  if (unsubscribe && !started) {
    started = true
    void listen()
  }
  return unsubscribe
}
