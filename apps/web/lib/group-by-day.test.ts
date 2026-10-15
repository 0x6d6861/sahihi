import { describe, expect, test } from "bun:test"
import { groupByDay } from "./group-by-day"

const now = new Date("2026-10-15T09:00:00Z") // 12:00 in Nairobi
const at = (iso: string) => ({ at: iso })

describe("groupByDay", () => {
  test("labels today, yesterday and older days", () => {
    const groups = groupByDay(
      [at("2026-10-15T08:00:00Z"), at("2026-10-14T10:00:00Z"), at("2026-10-12T10:00:00Z")],
      (i) => i.at,
      now,
    )
    expect(groups.map((g) => g.label)).toEqual(["Today", "Yesterday", "12 Oct 2026"])
  })

  test("keeps consecutive items of a day together", () => {
    const groups = groupByDay(
      [at("2026-10-15T08:00:00Z"), at("2026-10-15T07:00:00Z"), at("2026-10-14T07:00:00Z")],
      (i) => i.at,
      now,
    )
    expect(groups.map((g) => g.items.length)).toEqual([2, 1])
  })

  test("days follow Nairobi time, not UTC", () => {
    // 22:30 UTC on the 14th is 01:30 on the 15th in Nairobi.
    const [group] = groupByDay([at("2026-10-14T22:30:00Z")], (i) => i.at, now)
    expect(group?.label).toBe("Today")
  })

  test("an empty list has no groups", () => {
    expect(groupByDay([], (i: { at: string }) => i.at, now)).toEqual([])
  })
})
