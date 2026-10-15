import { describe, expect, test } from "bun:test"
import { GettingStartedPreferenceSchema, gettingStarted } from "./getting-started"

const none = { teammates: 0, documents: 0, sentEnvelopes: 0, generatedDocuments: 0 }

describe("gettingStarted", () => {
  test("a new workspace has only the workspace step done", () => {
    const s = gettingStarted(none)
    expect(s.done).toBe(1)
    expect(s.total).toBe(5)
    expect(s.complete).toBe(false)
    expect(s.steps.filter((x) => x.done).map((x) => x.step)).toEqual(["workspace"])
  })

  test("a pending invitation counts as inviting the team", () => {
    const s = gettingStarted({ ...none, teammates: 1 })
    expect(s.steps.find((x) => x.step === "team")?.done).toBe(true)
  })

  test("everything done completes the checklist", () => {
    const s = gettingStarted({
      teammates: 2,
      documents: 3,
      sentEnvelopes: 1,
      generatedDocuments: 1,
    })
    expect(s).toMatchObject({ done: 5, complete: true })
  })

  test("steps keep their order", () => {
    expect(gettingStarted(none).steps.map((x) => x.step)).toEqual([
      "workspace",
      "team",
      "upload",
      "send",
      "draft",
    ])
  })
})

describe("GettingStartedPreferenceSchema", () => {
  test("takes a boolean only", () => {
    expect(GettingStartedPreferenceSchema.safeParse({ dismissed: true }).success).toBe(true)
    expect(GettingStartedPreferenceSchema.safeParse({ dismissed: "yes" }).success).toBe(false)
  })
})
