import { dayKey, formatDate } from "@/lib/format"

export interface DayGroup<T> {
  /** "2026-10-03" */
  key: string
  /** "Today", "Yesterday" or "3 Oct 2026" */
  label: string
  items: T[]
}

const DAY = 86_400_000

/**
 * Items in runs by Nairobi calendar day (the Inbox's day headers), in the order given: a list
 * sorted newest first gives the newest day first. `now` is passed in so the server render and
 * hydration agree.
 */
export function groupByDay<T>(
  items: T[],
  dateOf: (item: T) => string | Date,
  now: Date,
): DayGroup<T>[] {
  const today = dayKey(now)
  const yesterday = dayKey(new Date(now.getTime() - DAY))
  const groups: DayGroup<T>[] = []
  for (const item of items) {
    const date = dateOf(item)
    const key = dayKey(date)
    let group = groups.at(-1)
    if (!group || group.key !== key) {
      const label = key === today ? "Today" : key === yesterday ? "Yesterday" : formatDate(date)
      group = { key, label, items: [] }
      groups.push(group)
    }
    group.items.push(item)
  }
  return groups
}
