"use client"

import type { InvitationState, OrgRole } from "@sahihi/core"
import { EllipsisIcon, MailIcon, XIcon } from "lucide-react"
import { useRouter } from "next/navigation"
import { useState } from "react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Menu, MenuItem, MenuPopup, MenuTrigger } from "@/components/ui/menu"
import { Spinner } from "@/components/ui/spinner"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { toastManager } from "@/components/ui/toast"
import { organization } from "@/lib/auth-client"
import { INVITATION_BADGE, roleLabel } from "@/lib/members"

export interface InvitationRow {
  id: string
  email: string
  role: string
  status: string
  expiresAt: string
}

const dateTime = new Intl.DateTimeFormat("en-GB", {
  dateStyle: "medium",
  timeStyle: "short",
  timeZone: "Africa/Nairobi",
})

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
            <TableHead className="w-10">
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
        <Badge variant={badge.variant}>{badge.label}</Badge>
      </TableCell>
      <TableCell className="text-muted-foreground">
        {dateTime.format(new Date(invitation.expiresAt))}
      </TableCell>
      {withActions && (
        <TableCell>
          {(canResend || canCancel) && (
            <Menu>
              <MenuTrigger
                render={
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    aria-label={`Actions for ${invitation.email}`}
                    disabled={busy}
                  />
                }
              >
                {busy ? <Spinner aria-hidden /> : <EllipsisIcon aria-hidden />}
              </MenuTrigger>
              <MenuPopup align="end">
                {canResend && (
                  <MenuItem onClick={resend}>
                    <MailIcon aria-hidden />
                    Resend invitation
                  </MenuItem>
                )}
                {canCancel && (
                  <MenuItem variant="destructive" onClick={cancel}>
                    <XIcon aria-hidden />
                    Cancel invitation
                  </MenuItem>
                )}
              </MenuPopup>
            </Menu>
          )}
        </TableCell>
      )}
    </TableRow>
  )
}
