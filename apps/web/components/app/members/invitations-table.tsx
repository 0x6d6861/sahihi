"use client"

import type { InvitationState, OrgRole } from "@sahihi/core"
import { useRouter } from "next/navigation"
import { useState } from "react"
import { MailIcon, XIcon } from "@/components/app/icons"
import { toastManager } from "@/components/app/toast"
import { Badge } from "@/components/arc/badge/badge"
import { type DropdownItem, DropdownMenu } from "@/components/arc/dropdown-menu/dropdown-menu"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { organization } from "@/lib/auth-client"
import { formatDateTime } from "@/lib/format"
import { INVITATION_BADGE, roleLabel } from "@/lib/members"

export interface InvitationRow {
  id: string
  email: string
  role: string
  status: string
  expiresAt: string
}

/**
 * Outstanding invitations. Resend re-sends the email (and refreshes the expiry) when the viewer
 * may invite that role; Cancel makes the link stop working.
 */
export function InvitationsTable({
  invitations,
  invitableRoles,
  canCancel,
}: {
  invitations: (InvitationRow & { state: InvitationState })[]
  invitableRoles: OrgRole[]
  canCancel: boolean
}) {
  const withActions = canCancel || invitableRoles.length > 0
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Email</TableHead>
          <TableHead>Role</TableHead>
          <TableHead>Status</TableHead>
          <TableHead>Expires</TableHead>
          {withActions && (
            <TableHead className="w-0">
              <span className="sr-only">Actions</span>
            </TableHead>
          )}
        </TableRow>
      </TableHeader>
      <TableBody>
        {invitations.map((inv) => (
          <InvitationRowView
            key={inv.id}
            invitation={inv}
            canResend={invitableRoles.includes(inv.role as OrgRole)}
            canCancel={canCancel}
            withActions={withActions}
          />
        ))}
      </TableBody>
    </Table>
  )
}

function InvitationRowView({
  invitation,
  canResend,
  canCancel,
  withActions,
}: {
  invitation: InvitationRow & { state: InvitationState }
  canResend: boolean
  canCancel: boolean
  withActions: boolean
}) {
  const router = useRouter()
  const [busy, setBusy] = useState(false)
  const badge = INVITATION_BADGE[invitation.state]

  async function resend() {
    setBusy(true)
    const { error } = await organization.inviteMember({
      email: invitation.email,
      role: invitation.role as OrgRole,
      resend: true,
    })
    setBusy(false)
    if (error) {
      toastManager.add({ title: "Not resent", description: error.message, type: "error" })
      return
    }
    toastManager.add({ title: `Invitation resent to ${invitation.email}`, type: "success" })
    router.refresh()
  }

  async function cancel() {
    setBusy(true)
    const { error } = await organization.cancelInvitation({ invitationId: invitation.id })
    setBusy(false)
    if (error) {
      toastManager.add({ title: "Not canceled", description: error.message, type: "error" })
      return
    }
    toastManager.add({
      title: "Invitation canceled",
      description: `The link sent to ${invitation.email} no longer works.`,
      type: "success",
    })
    router.refresh()
  }

  return (
    <TableRow>
      <TableCell className="font-medium">{invitation.email}</TableCell>
      <TableCell>{roleLabel(invitation.role)}</TableCell>
      <TableCell>
        <Badge tone={badge.tone} size="sm">
          {badge.label}
        </Badge>
      </TableCell>
      <TableCell className="text-muted-foreground">
        {formatDateTime(new Date(invitation.expiresAt))}
      </TableCell>
      {withActions && (
        <TableCell>
          {(canResend || canCancel) && (
            <DropdownMenu
              label="Actions"
              items={[
                ...(canResend
                  ? [
                      {
                        label: "Resend invitation",
                        icon: <MailIcon />,
                        disabled: busy,
                        onSelect: () => void resend(),
                      } satisfies DropdownItem,
                    ]
                  : []),
                ...(canCancel
                  ? [
                      {
                        label: "Cancel invitation",
                        icon: <XIcon />,
                        destructive: true,
                        disabled: busy,
                        onSelect: () => void cancel(),
                      } satisfies DropdownItem,
                    ]
                  : []),
              ]}
            />
          )}
        </TableCell>
      )}
    </TableRow>
  )
}
