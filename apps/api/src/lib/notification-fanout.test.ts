import { describe, expect, test } from "bun:test"
import { createFanout } from "./notification-fanout"

describe("createFanout", () => {
  test("dispatch calls only the listeners of that workspace and user", () => {
    const fanout = createFanout()
    const calls: string[] = []
    fanout.subscribe("org1:alice", () => calls.push("a1"))
    fanout.subscribe("org1:alice", () => calls.push("a2"))
    fanout.subscribe("org2:alice", () => calls.push("other org"))
    fanout.subscribe("org1:bob", () => calls.push("bob"))
    fanout.dispatch("org1:alice")
    fanout.dispatch("org9:nobody")
    expect(calls).toEqual(["a1", "a2"])
  })

  test("dispatchAll calls everyone", () => {
    const fanout = createFanout()
    const calls: string[] = []
    fanout.subscribe("org1:alice", () => calls.push("alice"))
    fanout.subscribe("org1:bob", () => calls.push("bob"))
    fanout.dispatchAll()
    expect(calls.sort()).toEqual(["alice", "bob"])
  })

  test("unsubscribe stops calls and forgets empty keys", () => {
    const fanout = createFanout()
    let calls = 0
    const off = fanout.subscribe("org1:alice", () => calls++)
    off?.()
    off?.()
    fanout.dispatch("org1:alice")
    expect(calls).toBe(0)
    expect(fanout.size).toBe(0)
  })

  test("refuses listeners beyond the cap, and accepts again once one leaves", () => {
    const fanout = createFanout()
    const first = fanout.subscribe("org1:alice", () => {}, 2)
    expect(fanout.subscribe("org1:alice", () => {}, 2)).not.toBeNull()
    expect(fanout.subscribe("org1:alice", () => {}, 2)).toBeNull()
    expect(fanout.subscribe("org1:bob", () => {}, 2)).not.toBeNull()
    first?.()
    expect(fanout.subscribe("org1:alice", () => {}, 2)).not.toBeNull()
  })
})
