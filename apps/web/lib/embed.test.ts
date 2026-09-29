import { describe, expect, test } from "bun:test"
import { embedEventFor, postEmbedEvent } from "./embed"

describe("embedded signing events", () => {
  test("ready on first load; signed/declined on transitions; nothing otherwise", () => {
    expect(embedEventFor(null, "ready")).toBe("sahihi:ready")
    expect(embedEventFor(null, "signed")).toBe("sahihi:ready")
    expect(embedEventFor("ready", "signed")).toBe("sahihi:signed")
    expect(embedEventFor("ready", "completed")).toBe("sahihi:signed")
    expect(embedEventFor("ready", "declined")).toBe("sahihi:declined")
    expect(embedEventFor("ready", "ready")).toBeNull()
    expect(embedEventFor("ready", "expired")).toBeNull()
  })

  test("posts once per allowed origin; nothing without a parent", () => {
    const sent: [unknown, string][] = []
    postEmbedEvent("sahihi:signed", "signed", ["https://a.co", "https://b.co"], {
      postMessage: ((msg: unknown, origin: string) =>
        sent.push([msg, origin])) as Window["postMessage"],
    })
    expect(sent).toEqual([
      [{ type: "sahihi:signed", state: "signed" }, "https://a.co"],
      [{ type: "sahihi:signed", state: "signed" }, "https://b.co"],
    ])
    expect(() => postEmbedEvent("sahihi:ready", "ready", ["https://a.co"], null)).not.toThrow()
  })
})
