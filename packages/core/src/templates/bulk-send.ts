import { z } from "zod"
import {
  draftFromTemplate,
  hasFixedContact,
  type TemplateForUse,
  type TemplateIssue,
} from "./templates"

/**
 * Bulk send (docs/bulk-send.md): one template, many rows, one envelope per row.
 * Pure logic: CSV parsing, column mapping per template role, validation, title placeholders.
 */

export const BULK_SEND_MAX_ROWS = 500

export const BulkRowSchema = z.object({
  recipients: z
    .array(
      z.object({
        roleId: z.string().min(1),
        name: z.string(),
        email: z.string(),
        phone: z.string().optional(),
      }),
    )
    .max(50),
})
export type BulkRow = z.infer<typeof BulkRowSchema>

export const CreateBulkSendSchema = z.object({
  /** May contain placeholders like "Lease – {{Tenant name}}" (see renderBulkTitle). */
  title: z.string().trim().min(1).max(200),
  message: z.string().max(2000).optional(),
  rows: z.array(BulkRowSchema).min(1, "Add at least one row").max(BULK_SEND_MAX_ROWS),
})
export type CreateBulkSendInput = z.infer<typeof CreateBulkSendSchema>

export const ApiCreateBulkSendSchema = CreateBulkSendSchema.extend({
  templateId: z.string().min(1),
})

// ── CSV ─────────────────────────────────────────────────────────────────────
/**
 * RFC 4180 CSV: quoted fields, "" escapes, commas and newlines inside quotes, CRLF or LF, a
 * leading BOM (Excel). Blank lines are skipped. Also accepts semicolons when the header has no
 * comma (Excel in many locales).
 */
export function parseCsv(input: string): string[][] {
  const text = input.replace(/^﻿/, "")
  const firstLine = text.split(/\r?\n/, 1)[0] ?? ""
  const sep = !firstLine.includes(",") && firstLine.includes(";") ? ";" : ","
  const rows: string[][] = []
  let row: string[] = []
  let field = ""
  let quoted = false
  for (let i = 0; i < text.length; i++) {
    const ch = text[i] as string
    if (quoted) {
      if (ch === '"' && text[i + 1] === '"') {
        field += '"'
        i += 1
      } else if (ch === '"') quoted = false
      else field += ch
      continue
    }
    if (ch === '"' && field === "") quoted = true
    else if (ch === sep) {
      row.push(field)
      field = ""
    } else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && text[i + 1] === "\n") i += 1
      row.push(field)
      if (row.some((v) => v.trim() !== "")) rows.push(row)
      row = []
      field = ""
    } else field += ch
  }
  row.push(field)
  if (row.some((v) => v.trim() !== "")) rows.push(row)
  return rows
}

const csvCell = (v: string) => (/[",\n\r]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v)

// ── Columns ──────────────────────────────────────────────────────────────────
export interface BulkColumn {
  header: string
  roleId: string
  field: "name" | "email" | "phone"
}

const norm = (h: string) => h.trim().toLowerCase().replace(/\s+/g, " ")

/**
 * The CSV columns a template needs: "<Role> name", "<Role> email" (and "<Role> phone" for SMS
 * verification) for every role without a fixed contact. With exactly one such role, plain
 * "name" / "email" / "phone" headers are accepted too.
 */
export function bulkColumns(roles: TemplateForUse["roles"]): BulkColumn[] {
  return roles
    .filter((r) => !hasFixedContact(r))
    .flatMap((r) => [
      { header: `${r.label} name`, roleId: r.id, field: "name" as const },
      { header: `${r.label} email`, roleId: r.id, field: "email" as const },
      ...(r.verification === "SMS_OTP"
        ? [{ header: `${r.label} phone`, roleId: r.id, field: "phone" as const }]
        : []),
    ])
}

/** A header line (and one example row) for "Download CSV template". */
export function bulkCsvTemplate(roles: TemplateForUse["roles"]): string {
  const cols = bulkColumns(roles)
  const example = cols.map((c) =>
    c.field === "name" ? "Jane Doe" : c.field === "email" ? "jane@example.com" : "+254712345678",
  )
  return `${cols.map((c) => csvCell(c.header)).join(",")}\r\n${example.map(csvCell).join(",")}\r\n`
}

export interface BulkRowIssue {
  /** 1-based data row (the header is row 0); 0 = the header itself */
  row: number
  message: string
}

/**
 * CSV text → rows ready for CreateBulkSendSchema, validated exactly like a single "Use template"
 * (draftFromTemplate): missing columns, invalid emails, duplicate emails within a row, missing
 * phones for SMS roles. Returns every issue, not just the first.
 */
export function rowsFromCsv(
  template: TemplateForUse,
  csv: string,
): { rows: BulkRow[]; issues: BulkRowIssue[] } {
  const table = parseCsv(csv)
  const [header, ...data] = table
  const cols = bulkColumns(template.roles)
  if (!header) return { rows: [], issues: [{ row: 0, message: "The file is empty" }] }

  const openRoles = new Set(cols.map((c) => c.roleId))
  const single = openRoles.size === 1
  const index = new Map(header.map((h, i) => [norm(h), i]))
  const find = (c: BulkColumn) =>
    index.get(norm(c.header)) ?? (single ? index.get(c.field) : undefined)

  const missing = cols.filter((c) => c.field !== "phone" && find(c) === undefined)
  if (missing.length > 0) {
    return {
      rows: [],
      issues: [
        {
          row: 0,
          message: `Missing column${missing.length > 1 ? "s" : ""}: ${missing.map((c) => c.header).join(", ")}`,
        },
      ],
    }
  }
  if (data.length === 0)
    return { rows: [], issues: [{ row: 0, message: "No rows below the header" }] }
  if (data.length > BULK_SEND_MAX_ROWS) {
    return {
      rows: [],
      issues: [{ row: 0, message: `Up to ${BULK_SEND_MAX_ROWS} rows per bulk send` }],
    }
  }

  const rows: BulkRow[] = []
  const issues: BulkRowIssue[] = []
  data.forEach((cells, i) => {
    const byRole = new Map<
      string,
      { roleId: string; name: string; email: string; phone?: string }
    >()
    for (const c of cols) {
      const at = find(c)
      const value = at === undefined ? "" : (cells[at] ?? "").trim()
      const entry = byRole.get(c.roleId) ?? { roleId: c.roleId, name: "", email: "" }
      if (c.field === "phone") entry.phone = value || undefined
      else entry[c.field] = value
      byRole.set(c.roleId, entry)
    }
    const recipients = [...byRole.values()]
    const draft = draftFromTemplate(template, recipients)
    if (!draft.ok) {
      issues.push(
        ...draft.issues.map((iss) => ({ row: i + 1, message: rowMessage(template, iss) })),
      )
    } else rows.push({ recipients })
  })
  return { rows, issues }
}

function rowMessage(template: TemplateForUse, issue: TemplateIssue): string {
  const roleId = issue.path.split(".")[1]
  const role = template.roles.find((r) => r.id === roleId)
  return role ? `${role.label}: ${issue.message}` : issue.message
}

/** Validates API/JSON rows the same way (all rows, all issues). */
export function validateBulkRows(template: TemplateForUse, rows: BulkRow[]): BulkRowIssue[] {
  return rows.flatMap((r, i) => {
    const draft = draftFromTemplate(template, r.recipients)
    return draft.ok
      ? []
      : draft.issues.map((iss) => ({ row: i + 1, message: rowMessage(template, iss) }))
  })
}

// ── Titles ───────────────────────────────────────────────────────────────────
/** "Lease – {{Tenant name}}" → "Lease – Amina Hassan" for this row; unknown placeholders stay. */
export function renderBulkTitle(title: string, template: TemplateForUse, row: BulkRow): string {
  const values = new Map<string, string>()
  for (const r of template.roles) {
    const person = hasFixedContact(r)
      ? { name: r.name ?? "", email: r.email ?? "" }
      : row.recipients.find((p) => p.roleId === r.id)
    if (!person) continue
    values.set(norm(`${r.label} name`), person.name.trim())
    values.set(norm(`${r.label} email`), person.email.trim())
  }
  return title
    .replace(/\{\{\s*([^}]+?)\s*\}\}/g, (m, key: string) => values.get(norm(key)) ?? m)
    .slice(0, 200)
}

export const BULK_SEND_STATUSES = ["PENDING", "RUNNING", "DONE"] as const
export type BulkSendStatus = (typeof BULK_SEND_STATUSES)[number]
export const BULK_ITEM_STATUSES = ["PENDING", "SENT", "FAILED"] as const
export type BulkItemStatus = (typeof BULK_ITEM_STATUSES)[number]
