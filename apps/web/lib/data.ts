import type { BadgeTone } from "./constants"

/** Export status as a badge; READY archives expire after EXPORT_TTL_DAYS. */
export function exportStatus(
  x: { status: "PENDING" | "READY" | "FAILED"; downloadable: boolean },
  _now: Date,
): { label: string; tone: BadgeTone } {
  if (x.status === "PENDING") return { label: "Preparing", tone: "info" }
  if (x.status === "FAILED") return { label: "Failed", tone: "danger" }
  return x.downloadable
    ? { label: "Ready", tone: "success" }
    : { label: "Expired", tone: "neutral" }
}

/** 1536 → "1.5 KB", 5_242_880 → "5.0 MB". */
export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  const units = ["KB", "MB", "GB"]
  let value = bytes / 1024
  let i = 0
  while (value >= 1024 && i < units.length - 1) {
    value /= 1024
    i += 1
  }
  return `${value.toFixed(1)} ${units[i]}`
}
