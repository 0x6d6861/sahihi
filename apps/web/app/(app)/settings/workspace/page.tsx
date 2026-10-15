import { canEditWorkspace, canLeaveWorkspace, LOGO_MAX_HEIGHT, LOGO_MAX_WIDTH } from "@sahihi/core"
import { redirect } from "next/navigation"
import { SettingsSection } from "@/components/app/settings/settings-section"
import { AssistantSwitch } from "@/components/app/workspace/assistant-switch"
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
 * The active workspace's name and logo, the AI assistant switch, and leaving it (docs/auth.md → Account settings).
 * Everyone sees it; owners and admins edit. Deleting the workspace is under Data.
 */
export default async function WorkspacePage() {
  const [session, { data: org }, { data: ai }] = await Promise.all([
    getServerSession(),
    apiServer<FullOrganization>("/auth/organization/get-full-organization"),
    apiServer<{ configured: boolean; enabled: boolean; canManage: boolean }>(
      "/generated-documents/settings",
    ),
  ])
  if (!session) redirect("/sign-in")
  const viewer = org?.members.find((m) => m.userId === session.user.id)
  if (!org || !viewer) redirect("/onboarding")

  const canEdit = canEditWorkspace(viewer.role)
  const ownerCount = org.members.filter((m) => m.role.split(",").includes("owner")).length

  return (
    <div className="flex flex-col gap-6">
      <SettingsSection title="Workspace">
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
      </SettingsSection>

      <SettingsSection
        title="Logo"
        description={`Shown at the top of emails sent to recipients and on the signing page. PNG, JPG or WebP; it's resized to fit ${LOGO_MAX_WIDTH}×${LOGO_MAX_HEIGHT} pixels.`}
      >
        <WorkspaceLogo logoPath={brandingLogoPath(org.logo)} name={org.name} canEdit={canEdit} />
      </SettingsSection>

      {/* Only where the server has a model (AI_MODEL); owners and admins switch it. */}
      {ai?.configured && (
        <SettingsSection
          title="AI assistant"
          description="Drafts documents from reviewed starters. Document text is sent to the AI provider while it's on."
        >
          {ai.canManage ? (
            <AssistantSwitch enabled={ai.enabled} />
          ) : (
            <p className="text-muted-foreground text-sm">
              {ai.enabled ? "On" : "Off"}. Only owners and admins can change it.
            </p>
          )}
        </SettingsSection>
      )}

      {canLeaveWorkspace(viewer.role, ownerCount) && (
        <SettingsSection
          title="Leave workspace"
          description={`Remove yourself from ${org.name}. Your account and other workspaces aren't affected.`}
        >
          <LeaveWorkspace id={org.id} name={org.name} />
        </SettingsSection>
      )}
    </div>
  )
}
