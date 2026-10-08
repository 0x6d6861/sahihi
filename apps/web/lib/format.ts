/**
 * The one place dates are formatted for display (docs/ui.md → Dates). Workspaces are in East
 * Africa, so instants render in Nairobi time with the en-GB order ("3 Oct 2026"), whatever the
 * server's or browser's locale.
 */
const LOCALE = "en-GB"
const TIME_ZONE = "Africa/Nairobi"

const date = new Intl.DateTimeFormat(LOCALE, { dateStyle: "medium", timeZone: TIME_ZONE })
// Time on its own: ICU versions disagree on how `dateStyle` + `timeStyle` join ("3 Oct 2026 at
// 14:05" vs "3 Oct 2026, 14:05"), so formatDateTime joins the parts itself.
const time = new Intl.DateTimeFormat(LOCALE, { timeStyle: "short", timeZone: TIME_ZONE })
const dayMonth = new Intl.DateTimeFormat(LOCALE, {
  day: "numeric",
  month: "long",
  timeZone: TIME_ZONE,
})
// A calendar day the user picked in their own browser: no time zone conversion.
const localDate = new Intl.DateTimeFormat(LOCALE, { dateStyle: "medium" })

type DateInput = string | number | Date

const toDate = (value: DateInput) => (value instanceof Date ? value : new Date(value))

/** "3 Oct 2026" */
export function formatDate(value: DateInput): string {
  return date.format(toDate(value))
}

/** "3 Oct 2026 at 14:05" */
export function formatDateTime(value: DateInput): string {
  const d = toDate(value)
  return `${date.format(d)} at ${time.format(d)}`
}

/** "1 November", for resets and renewals within the year. */
export function formatDayMonth(value: DateInput): string {
  return dayMonth.format(toDate(value))
}

/** "3 Oct 2026" for a local calendar day (date pickers), without shifting it to Nairobi. */
export function formatLocalDate(value: Date): string {
  return localDate.format(value)
}

/** "1 document", "3 documents". */
export function pluralize(count: number, noun: string, plural = `${noun}s`): string {
  return `${count} ${count === 1 ? noun : plural}`
}
