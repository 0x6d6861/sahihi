import { expect } from "@playwright/test"
import { MAILPIT_URL } from "../env"

/** The newest email to `to` whose text matches `link`, polled (the worker sends asynchronously). */
export async function linkFromEmail(to: string, link: RegExp, timeoutMs = 60_000): Promise<string> {
  let found: string | undefined
  await expect
    .poll(
      async () => {
        const search = await fetch(
          `${MAILPIT_URL}/api/v1/search?query=${encodeURIComponent(`to:"${to}"`)}`,
        ).then((r) => r.json() as Promise<{ messages: { ID: string }[] }>)
        for (const m of search.messages ?? []) {
          const msg = await fetch(`${MAILPIT_URL}/api/v1/message/${m.ID}`).then(
            (r) => r.json() as Promise<{ Text: string; HTML: string }>,
          )
          const match = `${msg.Text}\n${msg.HTML}`.match(link)
          if (match) {
            found = match[0].replace(/&amp;/g, "&")
            return true
          }
        }
        return false
      },
      { timeout: timeoutMs, intervals: [1_000] },
    )
    .toBe(true)
  return found as string
}
