import { canEditWorkspace, canLeaveWorkspace, LOGO_MAX_HEIGHT, LOGO_MAX_WIDTH } from "@sahihi/core"
import { redirect } from "next/navigation"
import { Panel } from "@/components/app/panel"
import { LeaveWorkspace } from "@/components/app/workspace/leave-workspace"
import { WorkspaceLogo } from "@/components/app/workspace/workspace-logo"
import { WorkspaceNameForm } from "@/components/app/workspace/workspace-name-form"
import { brandingLogoPath } from "@/lib/account"
import { apiServer, getServerSession } from "@/lib/api-server"

interface FullOrganization {
  id: string
  name: string
  slug: string
  logo: string | null
  members: { userId: string; role: string }[]
}

export const metadata = { title: "Workspace" }

/**
 * The active workspace's name and logo, and leaving it (docs/auth.md → Account settings).
 * Everyone sees it; owners and admins edit. Deleting the workspace is under Data.
 */
export default async function WorkspacePage() {
  const [session, { data: org }] = await Promise.all([
    getServerSession(),
    apiServer<FullOrganization>("/auth/organization/get-full-organization"),
  ])
  if (!session) redirect("/sign-in")
  const viewer = org?.members.find((m) => m.userId === session.user.id)
  if (!org || !viewer) redirect("/onboarding")

  const canEdit = canEditWorkspace(viewer.role)
  const ownerCount = org.members.filter((m) => m.role.split(",").includes("owner")).length

  return (
    <div className="flex flex-col gap-6">
      <Panel title="Workspace">
        {canEdit ? (
          <WorkspaceNameForm id={org.id} name={org.name} />
        ) : (
          <div className="flex flex-col gap-1">
            <span className="font-medium text-sm">{org.name}</span>
            <span className="text-muted-foreground text-sm">
              Only owners and admins can rename the workspace.
            </span>
          </div>
        )}
      </Panel>

      <Panel
        title="Logo"
        description={`Shown at the top of emails sent to recipients and on the signing page. PNG, JPG or WebP; it's resized to fit ${LOGO_MAX_WIDTH}×${LOGO_MAX_HEIGHT} pixels.`}
      >
        <WorkspaceLogo logoPath={brandingLogoPath(org.logo)} name={org.name} canEdit={canEdit} />
      </Panel>

      {canLeaveWorkspace(viewer.role, ownerCount) && (
        <Panel
          title="Leave workspace"
          description={`Remove yourself from ${org.name}. Your account and other workspaces aren't affected.`}
        >
          <LeaveWorkspace id={org.id} name={org.name} />
        </Panel>
      )}
    </div>
  )
}
