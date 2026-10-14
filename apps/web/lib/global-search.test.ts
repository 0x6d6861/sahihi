import { describe, expect, test } from "bun:test"
import type { SearchItem } from "@sahihi/core"
import { searchEntries, searchItemHref } from "./global-search"

const items: SearchItem[] = [
  { kind: "folder", id: "f1", title: "Clients" },
  { kind: "document", id: "d1", title: "Lease.pdf", status: "READY" },
  {
    kind: "envelope",
    id: "e1",
    title: "Offer letter",
    status: "SENT",
    people: ["Amina Otieno", "amina@example.com"],
  },
  { kind: "template", id: "t1", title: "NDA" },
  { kind: "draft", id: "g1", title: "Board resolution" },
]

describe("searchItemHref", () => {
  test("opens each kind where the app shows it", () => {
    expect(items.map(searchItemHref)).toEqual([
      "/files?folder=f1",
      "/documents/d1",
      "/envelopes/e1",
      "/templates/t1/use",
      "/generate/g1",
    ])
  })
})

describe("searchEntries", () => {
  test("without a query, lists only pages and actions", () => {
    const entries = searchEntries("  ", items)
    expect(entries.some((e) => e.group === "Documents")).toBe(false)
    expect(entries.some((e) => e.label === "New envelope")).toBe(true)
    expect(entries.some((e) => e.group === "Settings" && e.label === "Members")).toBe(true)
  })

  test("with a query, adds the workspace's items and a full search on All files", () => {
    const entries = searchEntries("amina", items)
    const envelope = entries.find((e) => e.id === "envelope:e1")
    expect(envelope).toMatchObject({
      label: "Offer letter",
      description: "Sent",
      group: "Envelopes",
      keywords: ["Amina Otieno", "amina@example.com"],
    })
    expect(entries.at(-1)).toMatchObject({
      label: "Search All files for “amina”",
      href: "/files?q=amina",
    })
  })

  test("works before the index has loaded", () => {
    const entries = searchEntries("lease", null)
    expect(entries.at(-1)?.href).toBe("/files?q=lease")
    expect(entries.some((e) => e.group === "Documents")).toBe(false)
  })
})
