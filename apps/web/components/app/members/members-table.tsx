"use client"

import { memberActions, type OrgRole } from "@sahihi/core"
import { UserMinusIcon } from "lucide-react"
import { useRouter } from "next/navigation"
import { useState } from "react"
import {
  AlertDialog,
  AlertDialogClose,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogPopup,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Select, SelectItem, SelectPopup, SelectTrigger, SelectValue } from "@/components/ui/select"
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
import { MEMBER_ROLE_LABELS, roleLabel } from "@/lib/members"
import { initials } from "@/lib/nav"

export interface MemberRow {
  id: string
  role: string
  createdAt: string
  user: { name: string; email: string; image?: string | null }
}

const joined = new Intl.DateTimeFormat("en-GB", { dateStyle: "medium", timeZone: "Africa/Nairobi" })

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
  const [removing, setRemoving] = useState(false)
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
    setRemoving(true)
    const { error } = await organization.removeMember({ memberIdOrEmail: member.id })
    setRemoving(false)
    if (error) {
      toastManager.add({ title: "Member not removed", description: error.message, type: "error" })
      return
    }
    setConfirmOpen(false)
    toastManager.add({ title: `${name} was removed`, type: "success" })
    router.refresh()
  }

  return (
    <TableRow>
      <TableCell>
        <div className="flex items-center gap-3">
          <Avatar className="size-8">
            {member.user.image && <AvatarImage src={member.user.image} alt="" />}
            <AvatarFallback>{initials(member.user.name, member.user.email)}</AvatarFallback>
          </Avatar>
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
          <Badge variant="outline">{roleLabel(member.role)}</Badge>
        )}
      </TableCell>
      <TableCell className="text-muted-foreground">
        {joined.format(new Date(member.createdAt))}
      </TableCell>
      <TableCell>
        {actions.canRemove && (
          <AlertDialog open={confirmOpen} onOpenChange={(o) => !removing && setConfirmOpen(o)}>
            <AlertDialogTrigger
              render={<Button variant="ghost" size="icon-sm" aria-label={`Remove ${name}`} />}
            >
              <UserMinusIcon aria-hidden />
            </AlertDialogTrigger>
            <AlertDialogPopup>
              <AlertDialogHeader>
                <AlertDialogTitle>Remove {name}?</AlertDialogTitle>
                <AlertDialogDescription>
                  They lose access to this workspace immediately. Their documents and envelopes
                  stay, and envelopes they sent keep working. You can invite them again later.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogClose render={<Button variant="ghost" disabled={removing} />}>
                  Cancel
                </AlertDialogClose>
                <Button variant="destructive" onClick={remove} disabled={removing}>
                  {removing && <Spinner aria-hidden />}
                  Remove member
                </Button>
              </AlertDialogFooter>
            </AlertDialogPopup>
          </AlertDialog>
        )}
      </TableCell>
    </TableRow>
  )
}
