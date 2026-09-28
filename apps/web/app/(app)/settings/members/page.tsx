import { canCancelInvitations, invitableRoles, invitationState } from "@sahihi/core"
import { MailIcon } from "lucide-react"
import { redirect } from "next/navigation"
import { type InvitationRow, InvitationsTable } from "@/components/app/members/invitations-table"
import { InviteDialog } from "@/components/app/members/invite-dialog"
import { type MemberRow, MembersTable } from "@/components/app/members/members-table"
import { Card, CardPanel } from "@/components/ui/card"
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty"
import { Tabs, TabsList, TabsPanel, TabsTab } from "@/components/ui/tabs"
import { apiServer, getServerSession } from "@/lib/api-server"
import { isOutstanding } from "@/lib/members"

interface FullOrganization {
  id: string
  name: string
  members: (MemberRow & { userId: string })[]
  invitations: InvitationRow[]
}

export const metadata = { title: "Members" }

/**
 * Members & invitations of the active workspace (docs/auth.md → Members & invitations).
 * Data and mutations are better-auth's organization endpoints; the role rules come from
 * `@sahihi/core` so the page only offers what the server accepts.
 */
export default async function MembersPage() {
  const [session, { data: org }] = await Promise.all([
    getServerSession(),
    apiServer<FullOrganization>("/auth/organization/get-full-organization"),
  ])
  if (!session) redirect("/sign-in")
  const viewer = org?.members.find((m) => m.userId === session.user.id)
  if (!org || !viewer) redirect("/onboarding")

  const members = [...org.members].sort(
    (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime(),
  )
  const now = new Date()
  const invitations = org.invitations
    .map((inv) => ({ ...inv, state: invitationState(inv, now) }))
    .filter((inv) => isOutstanding(inv.state))
    .sort((a, b) => new Date(b.expiresAt).getTime() - new Date(a.expiresAt).getTime())
  const roles = invitableRoles(viewer.role)
  const canCancel = canCancelInvitations(viewer.role)

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex flex-col gap-1">
          <h1 className="font-semibold text-xl">Members</h1>
          <p className="text-muted-foreground text-sm">
            People in {org.name}. Everyone can send envelopes; admins and owners manage members.
          </p>
        </div>
        {roles.length > 0 && <InviteDialog roles={roles} />}
      </div>

      <Tabs defaultValue="members">
        <TabsList>
          <TabsTab value="members">
            Members <span className="text-muted-foreground tabular-nums">{members.length}</span>
          </TabsTab>
          <TabsTab value="invitations">
            Invitations{" "}
            <span className="text-muted-foreground tabular-nums">{invitations.length}</span>
          </TabsTab>
        </TabsList>
        <TabsPanel value="members" className="pt-4">
          <Card>
            <CardPanel>
              <MembersTable members={members} viewer={viewer} />
            </CardPanel>
          </Card>
        </TabsPanel>
        <TabsPanel value="invitations" className="pt-4">
          <Card>
            <CardPanel>
              {invitations.length === 0 ? (
                <Empty className="md:py-10">
                  <EmptyHeader>
                    <EmptyMedia variant="icon">
                      <MailIcon aria-hidden />
                    </EmptyMedia>
                    <EmptyTitle>No open invitations</EmptyTitle>
                    <EmptyDescription>
                      {roles.length > 0
                        ? "Invite a colleague and their invitation shows here until they join."
                        : "Admins and owners can invite colleagues to this workspace."}
                    </EmptyDescription>
                  </EmptyHeader>
                </Empty>
              ) : (
                <InvitationsTable
                  invitations={invitations}
                  invitableRoles={roles}
                  canCancel={canCancel}
                />
              )}
            </CardPanel>
          </Card>
        </TabsPanel>
      </Tabs>
    </div>
  )
}
