import { z } from "zod"
import type { EnvelopeStatus } from "../shared/enums"

/**
 * Data retention, export and deletion (docs/data-retention.md, ADR 0015; Kenya DPA 2019).
 *
 * Purging an envelope deletes its files and personal data but keeps the evidence: status,
 * timestamps, document and signed-PDF hashes, the certificate code and the hash-chained audit
 * trail (append-only, kept under the lawful-basis exception).
 */

/** Years to keep closed envelopes; null = keep forever (the default). */
export const RETENTION_YEARS = [null, 1, 3, 7, 10] as const
export type RetentionYears = (typeof RETENTION_YEARS)[number]

export const RetentionSettingsSchema = z.object({
  retentionYears: z.union([z.null(), z.literal(1), z.literal(3), z.literal(7), z.literal(10)]),
})
export type RetentionSettingsInput = z.infer<typeof RetentionSettingsSchema>

/** Envelopes in these states are finished and may be purged. */
export const CLOSED_STATUSES = [
  "COMPLETED",
  "DECLINED",
  "VOIDED",
  "EXPIRED",
] as const satisfies readonly EnvelopeStatus[]

export const isClosed = (status: EnvelopeStatus) =>
  (CLOSED_STATUSES as readonly EnvelopeStatus[]).includes(status)

/**
 * When an envelope closed: completion, voiding, or (for declined/expired, which have no own
 * timestamp) its last update.
 */
export function closedAt(e: {
  status: EnvelopeStatus
  completedAt: Date | null
  voidedAt: Date | null
  updatedAt: Date
}): Date | null {
  if (!isClosed(e.status)) return null
  return e.completedAt ?? e.voidedAt ?? e.updatedAt
}

/** Envelopes that closed before this instant are due for purging; null = keep forever. */
export function retentionCutoff(years: RetentionYears, now: Date = new Date()): Date | null {
  if (years === null) return null
  const cutoff = new Date(now)
  cutoff.setUTCFullYear(cutoff.getUTCFullYear() - years)
  return cutoff
}

export function retentionLabel(years: RetentionYears): string {
  return years === null
    ? "Keep forever"
    : `${years} ${years === 1 ? "year" : "years"} after closing`
}

// ── Redaction values ─────────────────────────────────────────────────────────
export const REDACTED = {
  envelopeTitle: "Deleted envelope",
  documentName: "Deleted document",
  recipientName: "Deleted recipient",
  /** Supporting files' names can name people ("ID - Amina.jpg"); their hashes stay. */
  attachmentName: "Deleted file",
  /** Keeps (envelopeId, email) unique without holding a real address. */
  recipientEmail: (recipientId: string) => `deleted-${recipientId}@redacted.invalid`,
} as const

export type PurgeReason = "retention" | "manual"

// ── Exports ──────────────────────────────────────────────────────────────────
export const EXPORT_STATUSES = ["PENDING", "READY", "FAILED"] as const
export type ExportStatus = (typeof EXPORT_STATUSES)[number]

/** Export archives are downloadable for this long, then deleted. */
export const EXPORT_TTL_DAYS = 7
/** One export at a time per workspace, and at most this many envelopes per archive (v1). */
export const EXPORT_MAX_ENVELOPES = 2_000
/** AI-generated documents per archive, most recently changed first (docs/ai-documents.md). */
export const EXPORT_MAX_GENERATED_DOCUMENTS = 2_000

/** "Lease – Unit 4 / Ngũgĩ" → a safe folder name inside the ZIP (kept unique by the id suffix). */
export function exportFolderName(title: string, id: string): string {
  const safe = title
    .normalize("NFKC")
    .replace(/[\\/:*?"<>|\p{Cc}]+/gu, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 80)
  return `${safe || "envelope"} (${id.slice(-8)})`
}

/** Owner confirmation for deleting a workspace: they must type its name exactly. */
export const DeleteWorkspaceSchema = z.object({ confirmName: z.string().min(1) })
