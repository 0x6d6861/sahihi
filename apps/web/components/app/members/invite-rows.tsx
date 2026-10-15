"use client"

import { InviteMemberSchema, type OrgRole } from "@sahihi/core"
import { Button } from "@/components/app/button"
import { PlusIcon, XIcon } from "@/components/app/icons"
import { Input } from "@/components/arc/input/input"
import { Select } from "@/components/arc/select/select"
import { organization } from "@/lib/auth-client"
import { MEMBER_ROLE_LABELS } from "@/lib/members"

export interface InviteRow {
  key: string
  email: string
  role: OrgRole
  error?: string
  /** Sent: the row stays, read-only, so people see what went out. */
  sent?: boolean
}

export const newInviteRow = (role: OrgRole = "member"): InviteRow => ({
  key: crypto.randomUUID(),
  email: "",
  role,
})

/**
 * Several invitations at once (onboarding's Team step): one row per person, email and role, "Add
 * another" up to `maxRows` (the seats left). The parent owns the rows; `sendInvites` sends the
 * filled ones and puts each server error (already a member, no seats left) on its own row.
 */
export function InviteRows({
  rows,
  roles,
  maxRows,
  onChange,
}: {
  rows: InviteRow[]
  roles: OrgRole[]
  maxRows: number | null
  onChange: (rows: InviteRow[]) => void
}) {
  const update = (key: string, patch: Partial<InviteRow>) =>
    onChange(rows.map((r) => (r.key === key ? { ...r, ...patch, error: undefined } : r)))
  const canAdd = maxRows === null || rows.length < maxRows
  return (
    <div className="flex flex-col gap-3">
      {rows.map((r, i) => (
        <div key={r.key} className="flex items-start gap-2">
          <div className="min-w-0 flex-1">
            <Input
              label={i === 0 ? "Email" : `Email ${i + 1}`}
              type="email"
              autoComplete="off"
              placeholder="name@company.co.ke"
              value={r.email}
              disabled={r.sent}
              error={r.error}
              description={r.sent ? "Invitation sent" : undefined}
              onChange={(e) => update(r.key, { email: e.target.value })}
            />
          </div>
          <div className="w-32 shrink-0">
            <Select
              label="Role"
              value={r.role}
              disabled={r.sent}
              onValueChange={(v) => update(r.key, { role: v as OrgRole })}
              options={roles.map((role) => ({ value: role, label: MEMBER_ROLE_LABELS[role] }))}
            />
          </div>
          {rows.length > 1 && !r.sent && (
            <div className="pt-7">
              <Button
                variant="ghost"
                size="sm"
                aria-label={`Remove ${r.email || `row ${i + 1}`}`}
                onClick={() => onChange(rows.filter((x) => x.key !== r.key))}
              >
                <XIcon aria-hidden />
              </Button>
            </div>
          )}
        </div>
      ))}
      {canAdd && (
        <span>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => onChange([...rows, newInviteRow(rows.at(-1)?.role)])}
          >
            <PlusIcon aria-hidden />
            Add another
          </Button>
        </span>
      )}
    </div>
  )
}

/**
 * Sends every filled, unsent row in order. Returns the rows with `sent` or `error` set, and how
 * many went out. Empty rows are ignored; an invalid email stops nothing else.
 */
export async function sendInvites(rows: InviteRow[]): Promise<{ rows: InviteRow[]; sent: number }> {
  const out: InviteRow[] = []
  let sent = 0
  for (const r of rows) {
    if (r.sent || !r.email.trim()) {
      out.push(r)
      continue
    }
    const parsed = InviteMemberSchema.safeParse({ email: r.email.trim(), role: r.role })
    if (!parsed.success) {
      out.push({ ...r, error: "Enter a valid email address" })
      continue
    }
    const { error } = await organization.inviteMember(parsed.data)
    if (error) out.push({ ...r, error: error.message ?? "Could not send the invitation" })
    else {
      out.push({ ...r, sent: true })
      sent += 1
    }
  }
  return { rows: out, sent }
}
