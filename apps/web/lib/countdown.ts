/** Seconds → "m:ss" for resend countdowns ("0:27", "1:05"). Negative or NaN shows "0:00". */
export function formatCountdown(seconds: number): string {
  const s = Number.isFinite(seconds) ? Math.max(0, Math.ceil(seconds)) : 0
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`
}
