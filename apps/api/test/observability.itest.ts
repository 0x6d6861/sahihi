import { afterEach, beforeEach, describe, expect, spyOn, test } from "bun:test"
import { getQueues } from "@sahihi/infra"
import { app, resetDb } from "./helpers"

// docs/observability.md
const TOKEN = "Iw5EsHZ9-zU3txYXca_4_Le8A8gQqrB-ZskLjCxij_A"
const basic = (user: string, password: string) =>
  `Basic ${Buffer.from(`${user}:${password}`).toString("base64")}`
const good = basic("ops", "test-dashboard-password-1234")

beforeEach(resetDb)

describe("request logs", () => {
  let lines: string[] = []
  let spies: ReturnType<typeof spyOn>[] = []
  beforeEach(() => {
    lines = []
    spies = [console.log, console.error].map((fn) =>
      spyOn(console, fn === console.log ? "log" : "error").mockImplementation(
        (...args: unknown[]) => {
          lines.push(args.map(String).join(" "))
        },
      ),
    )
  })
  afterEach(() => {
    for (const s of spies) s.mockRestore()
  })

  test("never contain a raw signing token; carry a request id", async () => {
    const res = await app.request(`/api/sign/${TOKEN}`, {
      headers: { "x-request-id": "req-12345678", "x-forwarded-for": "10.9.8.7" },
    })
    expect(res.status).toBe(404)
    expect(res.headers.get("x-request-id")).toBe("req-12345678")
    const all = lines.join("\n")
    expect(all).toContain("/api/sign/[token]")
    expect(all).toContain("req-12345678")
    expect(all).not.toContain(TOKEN)
  })
})

describe("queue dashboard (/admin/queues)", () => {
  test("requires staff credentials", async () => {
    expect((await app.request("/admin/queues")).status).toBe(401)
    expect(
      (
        await app.request("/admin/queues", {
          headers: { authorization: basic("ops", "wrong-password-xxxxxxxx") },
        })
      ).status,
    ).toBe(401)
    const ok = await app.request("/admin/queues", { headers: { authorization: good } })
    expect(ok.status).toBe(200)
    expect(await ok.text()).toContain("<html")
  })

  test("shows jobs with tokens and codes redacted", async () => {
    await getQueues().notifications.raw.obliterate({ force: true })
    await getQueues().notifications.add("envelope.invite", { recipientId: "r-dash", token: TOKEN })
    const res = await app.request(
      "/admin/queues/api/queues?activeQueue=notifications&status=waiting&page=1",
      { headers: { authorization: good } },
    )
    expect(res.status).toBe(200)
    const body = await res.text()
    expect(body).toContain("r-dash")
    expect(body).not.toContain(TOKEN)
    expect(body).toContain("[redacted]")
  })

  test("writes are limited to retries", async () => {
    const add = await app.request("/admin/queues/api/queues/notifications/add", {
      method: "POST",
      headers: { authorization: good, "content-type": "application/json" },
      body: JSON.stringify({ name: "envelope.invite", data: { recipientId: "x", token: "y" } }),
    })
    expect(add.status).toBe(405)
    const empty = await app.request("/admin/queues/api/queues/notifications/empty", {
      method: "PUT",
      headers: { authorization: good },
    })
    expect(empty.status).toBe(405)
    const retry = await app.request("/admin/queues/api/queues/notifications/some-job/retry", {
      method: "PUT",
      headers: { authorization: good },
    })
    expect(retry.status).not.toBe(405)
  })
})
