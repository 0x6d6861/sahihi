import type { DOCUMENT_LIST_STATUSES, DocumentPeriod, DocumentStatus } from "@sahihi/core"
import { pluralize } from "./format"

/** Labels and folder lines shared by All files, folders and the move dialog. */

export const PERIOD_LABEL: Record<DocumentPeriod, string> = {
  "7d": "Last 7 days",
  "30d": "Last 30 days",
  "90d": "Last 90 days",
  year: "This year",
}

export const LIST_STATUS_LABEL: Record<(typeof DOCUMENT_LIST_STATUSES)[number], string> = {
  READY: "Ready",
  FAILED: "Failed",
} satisfies Partial<Record<DocumentStatus, string>>

export const folderPathLabel = (path: { name: string }[]) => path.map((p) => p.name).join(" / ")

/** What a folder holds (ADR 0038); envelope and template counts are absent from older callers. */
export interface FolderCounts {
  documentCount: number
  envelopeCount?: number
  templateCount?: number
  folderCount: number
}

/**
 * "3 documents, 2 envelopes, 1 template, 1 folder": only the parts that aren't zero; "Empty" when
 * all are.
 */
export function folderSummary(c: FolderCounts): string {
  const parts = [
    c.documentCount > 0 ? pluralize(c.documentCount, "document") : null,
    c.envelopeCount ? pluralize(c.envelopeCount, "envelope") : null,
    c.templateCount ? pluralize(c.templateCount, "template") : null,
    c.folderCount > 0 ? pluralize(c.folderCount, "folder") : null,
  ].filter(Boolean)
  return parts.length > 0 ? parts.join(", ") : "Empty"
}

/**
 * The line under a folder's name: where it lives (search results, `path` set; `rootLabel` names
 * the top level) or what's in it.
 */
export function folderMeta(
  folder: FolderCounts & { path?: { name: string }[] },
  rootLabel = "Documents",
): string {
  return folder.path
    ? `In ${folder.path.length > 0 ? folderPathLabel(folder.path) : rootLabel}`
    : folderSummary(folder)
}
