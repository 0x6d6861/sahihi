import { beforeEach, describe, expect, test } from "bun:test"
import { redis } from "@sahihi/infra"
import { request, resetDb } from "./helpers"

/** docs/security.md → Rate limiting: only the proxy-appended X-Forwarded-For entry counts. */

beforeEach(resetDb)

async function verifyBuckets() {
  const keys: string[] = []
  let cursor = "0"
  do {
    const [next, batch] = await redis().scan(cursor, "MATCH", "rl:verify:*", "COUNT", 1000)
    cursor = next
    keys.push(...batch)
  } while (cursor !== "0")
  return keys.map((k) => k.split(":")[2])
}

describe("client IP for rate limits", () => {
  test("a forged left-hand X-Forwarded-For entry doesn't pick the bucket", async () => {
    const real = `41.90.${Math.floor(Math.random() * 250)}.7`
    for (const forged of ["6.6.6.6", "7.7.7.7", "8.8.8.8"]) {
      const res = await request(null, "/api/verify/AAAA-BBBB-CCCC", {
        headers: { "x-forwarded-for": `${forged}, ${real}` },
      })
      expect(res.status).toBe(404)
    }
    const buckets = await verifyBuckets()
    expect(buckets).toContain(real)
    for (const forged of ["6.6.6.6", "7.7.7.7", "8.8.8.8"]) expect(buckets).not.toContain(forged)
  })

  test("X-Real-IP is ignored", async () => {
    await request(null, "/api/verify/AAAA-BBBB-CCCC", { headers: { "x-real-ip": "9.9.9.9" } })
    expect(await verifyBuckets()).not.toContain("9.9.9.9")
  })
})
