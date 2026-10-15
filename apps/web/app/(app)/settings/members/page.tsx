import { canCancelInvitations, invitableRoles, invitationState } from "@sahihi/core"
import Link from "next/link"
import { redirect } from "next/navigation"
import { MailIcon } from "@/components/app/icons"
import { type InvitationRow, InvitationsTable } from "@/components/app/members/invitations-table"
import { InviteDialog } from "@/components/app/members/invite-dialog"
import { type MemberRow, MembersTable } from "@/components/app/members/members-table"
import { SettingsSection } from "@/components/app/settings/settings-section"
import { EmptyState } from "@/components/arc/empty-state/empty-state"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/arc/tabs/tabs"
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
  const [session, { data: org }, { data: billing }] = await Promise.all([
    getServerSession(),
    apiServer<FullOrganization>("/auth/organization/get-full-organization"),
    apiServer<{ plan: { name: string }; seats: { used: number; limit: number | null } }>(
      "/billing",
    ),
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
          <h2 className="font-medium text-lg">Members</h2>
          {billing && (
            <p className="text-muted-foreground text-sm tabular-nums">
              {billing.seats.limit === null
                ? `${billing.seats.used} seats in use on the ${billing.plan.name} plan`
                : `${billing.seats.used} of ${billing.seats.limit} seats used on the ${billing.plan.name} plan`}
              . A pending invitation holds a seat.{" "}
              <Link href="/settings/billing" className="underline underline-offset-4">
                Plan &amp; usage
              </Link>
            </p>
          )}
        </div>
        {roles.length > 0 && <InviteDialog roles={roles} />}
      </div>

      <Tabs defaultValue="members">
        <TabsList aria-label="Members and invitations">
          <TabsTrigger value="members">
            Members{" "}
            <span className="ms-1.5 text-muted-foreground tabular-nums">{members.length}</span>
          </TabsTrigger>
          <TabsTrigger value="invitations">
            Invitations{" "}
            <span className="ms-1.5 text-muted-foreground tabular-nums">{invitations.length}</span>
          </TabsTrigger>
        </TabsList>
        <TabsContent value="members" className="pt-4">
          <SettingsSection>
            <MembersTable members={members} viewer={viewer} />
          </SettingsSection>
        </TabsContent>
        <TabsContent value="invitations" className="pt-4">
          <SettingsSection>
            {invitations.length === 0 ? (
              <EmptyState
                className="md:py-10"
                icon={<MailIcon aria-hidden />}
                title="No open invitations"
                description={
                  roles.length > 0
                    ? "Invite a colleague and their invitation shows here until they join."
                    : "Admins and owners can invite colleagues to this workspace."
                }
              />
            ) : (
              <InvitationsTable
                invitations={invitations}
                invitableRoles={roles}
                canCancel={canCancel}
              />
            )}
          </SettingsSection>
        </TabsContent>
      </Tabs>
    </div>
  )
}
