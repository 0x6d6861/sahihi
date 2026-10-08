import { describe, expect, test } from "bun:test"
import {
  envelopesApiQuery,
  envelopesHref,
  hasEnvelopeFilters,
  parseEnvelopesView,
  recipientSummary,
  signingProgress,
} from "./envelope-list"

describe("envelopes view (URL)", () => {
  test("keeps known values and drops the rest", () => {
    expect(
      parseEnvelopesView({
        q: " lease ",
        stage: "active",
        sender: "u1",
        period: "30d",
        page: "2",
        layout: "grid",
      }),
    ).toEqual({ q: "lease", stage: "active", sender: "u1", period: "30d", page: 2, layout: "grid" })
    expect(parseEnvelopesView({ stage: "SENT", period: "2d", page: "x", layout: "tiles" })).toEqual(
      {
        q: undefined,
        stage: undefined,
        sender: undefined,
        period: undefined,
        page: undefined,
        layout: undefined,
      },
    )
  })

  test("changing a filter resets the page; paging and the layout keep the rest", () => {
    const view = { q: "nda", stage: "drafts" as const, page: 3, layout: "grid" as const }
    expect(envelopesHref(view, { stage: undefined })).toBe("/envelopes?q=nda&layout=grid")
    expect(envelopesHref(view, { page: 4 })).toBe(
      "/envelopes?q=nda&stage=drafts&page=4&layout=grid",
    )
    expect(envelopesHref({})).toBe("/envelopes")
  })

  test("maps URL names to API names and never sends the layout", () => {
    expect(envelopesApiQuery({ sender: "u1", stage: "closed", layout: "grid" })).toBe(
      "page=1&stage=closed&senderId=u1",
    )
  })

  test("the layout isn't a filter", () => {
    expect(hasEnvelopeFilters({ layout: "grid", page: 2 })).toBe(false)
    expect(hasEnvelopeFilters({ period: "7d" })).toBe(true)
  })
})

describe("row summaries", () => {
  test("recipient names", () => {
    expect(recipientSummary([])).toBe("No recipients yet")
    expect(recipientSummary(["A"])).toBe("A")
    expect(recipientSummary(["A", "B"])).toBe("A and B")
    expect(recipientSummary(["A", "B", "C"])).toBe("A + 2 more")
  })

  test("viewers don't count towards signing", () => {
    expect(
      signingProgress([
        { role: "SIGNER", status: "SIGNED" },
        { role: "APPROVER", status: "SENT" },
        { role: "VIEWER", status: "PENDING" },
      ]),
    ).toEqual({ signed: 1, total: 2 })
  })
})

describe("envelopes view: folders and labels (ADR 0038)", () => {
  test("reads folder, tag and colour and sends them to the API", () => {
    const view = parseEnvelopesView({ folder: "f1", tag: " NDA ", color: "1570d1" })
    expect(view).toMatchObject({ folder: "f1", tag: "NDA", color: "#1570D1" })
    expect(envelopesApiQuery(view)).toBe("page=1&folderId=f1&tag=NDA&color=1570D1")
    expect(hasEnvelopeFilters(view)).toBe(true)
  })

  test("opening another folder clears the search, tag and colour", () => {
    const view = { folder: "f1", q: "lease", tag: "nda", stage: "drafts" as const }
    expect(envelopesHref(view, { folder: "f2" })).toBe("/envelopes?folder=f2&stage=drafts")
    expect(envelopesHref(view, { stage: undefined })).toBe("/envelopes?folder=f1&q=lease&tag=nda")
  })
})
