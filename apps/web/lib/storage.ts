import {
  STORAGE_PROVIDER_INFO,
  type StorageConnectionStatus,
  type StorageDeliveryStatus,
  type StoragePrimaryState,
  type StorageProvider,
} from "@sahihi/core"
import type { BadgeTone } from "./constants"

/** Settings → Storage (docs/storage.md). Pure helpers, so they're unit-tested without a DOM. */

export interface StorageConnectionRow {
  id: string
  purpose: "SYNC" | "PRIMARY"
  provider: StorageProvider
  name: string
  endpoint: string | null
  region: string | null
  bucket: string | null
  prefix: string
  auth: "ACCESS_KEYS" | "AWS_ROLE" | "OAUTH"
  secretHint: string | null
  roleArn: string | null
  accountEmail: string | null
  rootFolder: string | null
  folderTemplate: string
  status: StorageConnectionStatus
  primaryState: StoragePrimaryState | null
  migratedCount: number
  migrateTotal: number
  lastCheckedAt: string | null
  lastError: string | null
  deliveries?: StorageDeliveryRow[]
}

export interface StorageDeliveryRow {
  id: string
  status: StorageDeliveryStatus
  attempts: number
  lastError: string | null
  path: string | null
  fileCount: number | null
  deliveredAt: string | null
  createdAt: string
  envelope: { id: string; title: string }
}

export const CONNECTION_BADGE: Record<StorageConnectionStatus, { label: string; tone: BadgeTone }> =
  {
    ACTIVE: { label: "Working", tone: "success" },
    FAILING: { label: "Not working", tone: "danger" },
    PENDING: { label: "Not tested", tone: "warning" },
  }

export const DELIVERY_BADGE: Record<StorageDeliveryStatus, { label: string; tone: BadgeTone }> = {
  SUCCEEDED: { label: "Copied", tone: "success" },
  FAILED: { label: "Failed", tone: "danger" },
  PENDING: { label: "Waiting", tone: "info" },
}

/** Where the files go, in a line: "s3://acme-contracts/sahihi/ · Amazon S3", "Google Drive · ann@acme.co". */
export function connectionWhere(c: StorageConnectionRow): string {
  const provider = STORAGE_PROVIDER_INFO[c.provider].label
  if (c.auth === "OAUTH") {
    const folder = c.rootFolder ? ` › ${c.rootFolder}` : ""
    return `${provider}${c.accountEmail ? ` · ${c.accountEmail}` : ""}${folder}`
  }
  return `${c.bucket ?? ""}${c.prefix ? `/${c.prefix.replace(/\/$/, "")}` : ""} · ${provider}${
    c.region && c.region !== "auto" ? ` (${c.region})` : ""
  }`
}

/** How the connection signs in: "Access key …WXYZ", "IAM role", "Signed in with Google". */
export function connectionAuth(c: StorageConnectionRow): string {
  if (c.auth === "AWS_ROLE") return `IAM role ${c.roleArn?.split("/").pop() ?? ""}`.trim()
  if (c.auth === "OAUTH") return "Signed in with the account above"
  return c.secretHint ? `Access key …${c.secretHint}` : "Access key"
}

/** Primary storage: where the files are and what's happening to them. */
export function primaryStatus(c: StorageConnectionRow): {
  label: string
  tone: BadgeTone
  progress: number | null
} {
  const progress =
    c.migrateTotal > 0 ? Math.min(100, Math.round((c.migratedCount / c.migrateTotal) * 100)) : null
  switch (c.primaryState) {
    case "MIGRATING_IN":
      return { label: "Moving files in", tone: "info", progress }
    case "MIGRATING_OUT":
      return { label: "Moving files back to Sahihi", tone: "warning", progress }
    case "ACTIVE":
      return { label: "In use", tone: "success", progress: null }
    default:
      return { label: "Not in use yet", tone: "neutral", progress: null }
  }
}

/** One delivery's outcome: "3 files · 2026/10/Lease (k3j9x2)", "Access denied · 4 attempts". */
export function deliveryOutcome(d: StorageDeliveryRow): string {
  if (d.status === "SUCCEEDED") {
    return `${d.fileCount ?? 0} ${d.fileCount === 1 ? "file" : "files"} · ${d.path ?? ""}`
  }
  if (d.attempts === 0) return "Waiting to be copied"
  const tries = d.attempts === 1 ? "1 attempt" : `${d.attempts} attempts`
  return `${d.lastError ?? "Error"} · ${tries}${d.status === "PENDING" ? " · retrying" : ""}`
}

/** The providers the "Add" form offers for a purpose (cloud drives connect with their own button). */
export function formProviders(purpose: "SYNC" | "PRIMARY") {
  return (Object.keys(STORAGE_PROVIDER_INFO) as StorageProvider[])
    .filter((p) => STORAGE_PROVIDER_INFO[p].kind === "s3")
    .filter((p) => purpose === "SYNC" || STORAGE_PROVIDER_INFO[p].supportsPrimary)
    .map((p) => ({ value: p, label: STORAGE_PROVIDER_INFO[p].label }))
}

/** A plan's own-storage tier, for the plans table: "—", "Sync to 1 destination", … */
export function ownStorageLabel(plan: {
  ownStorage: "none" | "sync" | "primary"
  storageDestinations: number
}): string {
  if (plan.ownStorage === "none") return "—"
  const sync = `sync to ${plan.storageDestinations} ${plan.storageDestinations === 1 ? "destination" : "destinations"}`
  return plan.ownStorage === "primary" ? `Your own bucket, ${sync}` : `S${sync.slice(1)}`
}
