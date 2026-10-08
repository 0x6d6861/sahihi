import { describe, expect, test } from "bun:test"
import { serializeQueries } from "./pg-pool"

/** A fake connection that records how many queries run at once. */
function fakeClient() {
  let running = 0
  const state = { maxRunning: 0, order: [] as string[] }
  const client = {
    query: (text: string) => {
      running += 1
      state.maxRunning = Math.max(state.maxRunning, running)
      return new Promise((resolve, reject) => {
        setTimeout(() => {
          running -= 1
          state.order.push(text)
          if (text === "fail") reject(new Error("boom"))
          else resolve({ rows: [text] })
        }, 5)
      })
    },
  }
  return { client, state }
}

describe("serializeQueries", () => {
  test("queries sent at once run one at a time, in order", async () => {
    const { client, state } = fakeClient()
    serializeQueries(client as never)
    const results = await Promise.all(["a", "b", "c"].map((q) => client.query(q)))
    expect(results).toEqual([{ rows: ["a"] }, { rows: ["b"] }, { rows: ["c"] }])
    expect(state.maxRunning).toBe(1)
    expect(state.order).toEqual(["a", "b", "c"])
  })

  test("a failed query rejects for its caller and the next one still runs", async () => {
    const { client, state } = fakeClient()
    serializeQueries(client as never)
    const failed = client.query("fail")
    const next = client.query("after")
    await expect(failed).rejects.toThrow("boom")
    expect(await next).toEqual({ rows: ["after"] })
    expect(state.order).toEqual(["fail", "after"])
  })

  test("callback-style calls pass through untouched", () => {
    const calls: unknown[][] = []
    const client = { query: (...args: unknown[]) => calls.push(args) }
    serializeQueries(client as never)
    const cb = () => {}
    client.query("select 1", [], cb)
    expect(calls).toEqual([["select 1", [], cb]])
  })
})
