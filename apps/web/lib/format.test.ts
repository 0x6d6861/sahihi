import { describe, expect, test } from "bun:test"
import { formatDate, formatDateTime, formatDayMonth, formatLocalDate, pluralize } from "./format"

describe("date formatting", () => {
  // 21:30 UTC on 2 Oct is already 3 Oct in Nairobi (UTC+3).
  const lateUtc = "2026-10-02T21:30:00.000Z"

  test("dates are shown in Nairobi time, day first", () => {
    expect(formatDate(lateUtc)).toBe("3 Oct 2026")
    expect(formatDate(new Date(lateUtc))).toBe("3 Oct 2026")
  })
  test("date and time", () => {
    expect(formatDateTime(lateUtc)).toBe("3 Oct 2026 at 00:30")
  })
  test("day and month", () => {
    expect(formatDayMonth("2026-11-01T00:00:00+03:00")).toBe("1 November")
  })
  test("a local calendar day keeps its date", () => {
    expect(formatLocalDate(new Date(2026, 9, 3))).toBe("3 Oct 2026")
  })
})

describe("pluralize", () => {
  test("singular only for exactly one", () => {
    expect(pluralize(0, "document")).toBe("0 documents")
    expect(pluralize(1, "folder")).toBe("1 folder")
    expect(pluralize(2, "person", "people")).toBe("2 people")
  })
})
