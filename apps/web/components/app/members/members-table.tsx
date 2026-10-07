"use client"

import { memberActions, type OrgRole } from "@sahihi/core"
import { useRouter } from "next/navigation"
import { useState } from "react"
import { ConfirmDialog } from "@/components/app/confirm-dialog"
import { UserMinusIcon } from "@/components/app/icons"
import { toastManager } from "@/components/app/toast"
import { Avatar } from "@/components/arc/avatar/avatar"
import { Badge } from "@/components/arc/badge/badge"
import { Button } from "@/components/ui/button"
// coss Select inside the table: the column header is its label (Arc's Select shows its own).
import { Select, SelectItem, SelectPopup, SelectTrigger, SelectValue } from "@/components/ui/select"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { organization } from "@/lib/auth-client"
import { formatDate } from "@/lib/format"
import { MEMBER_ROLE_LABELS, roleLabel } from "@/lib/members"

export interface MemberRow {
  id: string
  role: string
  createdAt: string
  user: { name: string; email: string; image?: string | null }
}

/**
 * Members of the active workspace. Role Select and Remove appear only where `memberActions`
 * (the same rules better-auth enforces) allows them; everything else is read-only.
 */
export function MembersTable({ members, viewer }: { members: MemberRow[]; viewer: MemberRow }) {
  const ownerCount = members.filter((m) => m.role.split(",").includes("owner")).length

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Member</TableHead>
          <TableHead className="w-44">Role</TableHead>
          <TableHead>Joined</TableHead>
          <TableHead className="w-10">
            <span className="sr-only">Actions</span>
          </TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {members.map((m) => (
          <MemberRowView
            key={m.id}
            member={m}
            isViewer={m.id === viewer.id}
            actions={memberActions(viewer, m, ownerCount)}
          />
        ))}
      </TableBody>
    </Table>
  )
}

function MemberRowView({
  member,
  isViewer,
  actions,
}: {
  member: MemberRow
  isViewer: boolean
  actions: ReturnType<typeof memberActions>
}) {
  const router = useRouter()
  const [saving, setSaving] = useState(false)
  const [confirmOpen, setConfirmOpen] = useState(false)
  const name = member.user.name || member.user.email
  const roleItems = [member.role, ...actions.assignableRoles].map((r) => ({
    value: r,
    label: roleLabel(r),
  }))

  async function changeRole(role: OrgRole) {
    setSaving(true)
    const { error } = await organization.updateMemberRole({ memberId: member.id, role })
    setSaving(false)
    if (error) {
      toastManager.add({ title: "Role not changed", description: error.message, type: "error" })
      return
    }
    toastManager.add({ title: `${name} is now ${MEMBER_ROLE_LABELS[role]}`, type: "success" })
    router.refresh()
  }

  async function remove() {
    const { error } = await organization.removeMember({ memberIdOrEmail: member.id })
    if (error) {
      toastManager.add({ title: "Member not removed", description: error.message, type: "error" })
      throw new Error(error.message)
    }
    toastManager.add({ title: `${name} was removed`, type: "success" })
    router.refresh()
  }

  return (
    <TableRow>
      <TableCell>
        <div className="flex items-center gap-3">
          <Avatar name={name} src={member.user.image ?? undefined} size="sm" />
          <div className="min-w-0">
            <div className="truncate font-medium">
              {member.user.name}
              {isViewer && <span className="text-muted-foreground font-normal"> (you)</span>}
            </div>
            <div className="truncate text-muted-foreground text-xs">{member.user.email}</div>
          </div>
        </div>
      </TableCell>
      <TableCell>
        {actions.assignableRoles.length > 0 ? (
          <Select
            items={roleItems}
            value={member.role}
            disabled={saving}
            onValueChange={(v) => v && v !== member.role && changeRole(v as OrgRole)}
          >
            <SelectTrigger className="w-full" aria-label={`Role of ${name}`}>
              <SelectValue />
            </SelectTrigger>
            <SelectPopup>
              {roleItems.map((it) => (
                <SelectItem key={it.value} value={it.value}>
                  {it.label}
                </SelectItem>
              ))}
            </SelectPopup>
          </Select>
        ) : (
          <Badge size="sm">{roleLabel(member.role)}</Badge>
        )}
      </TableCell>
      <TableCell className="text-muted-foreground">
        {formatDate(new Date(member.createdAt))}
      </TableCell>
      <TableCell>
        {actions.canRemove && (
          <>
            <Button
              variant="ghost"
              size="icon-sm"
              aria-label={`Remove ${name}`}
              onClick={() => setConfirmOpen(true)}
            >
              <UserMinusIcon aria-hidden />
            </Button>
            <ConfirmDialog
              open={confirmOpen}
              onOpenChange={setConfirmOpen}
              title={`Remove ${name}?`}
              description="They lose access to this workspace immediately. Their documents and envelopes stay, and envelopes they sent keep working. You can invite them again later."
              confirmLabel="Remove member"
              onConfirm={remove}
            />
          </>
        )}
      </TableCell>
    </TableRow>
  )
}
