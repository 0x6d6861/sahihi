import type { RetentionYears } from "@sahihi/core"
import { DeleteWorkspace } from "@/components/app/data/delete-workspace"
import { type ExportRow, ExportsPanel } from "@/components/app/data/exports-panel"
import { RetentionForm } from "@/components/app/data/retention-form"
import { Panel } from "@/components/app/panel"
import { Alert } from "@/components/arc/alert/alert"
import { apiServer, getServerSession } from "@/lib/api-server"

export const metadata = { title: "Data" }

/** Retention, export and workspace deletion (docs/data-retention.md). Owners and admins. */
export default async function DataPage() {
  const [session, settings, exports, org] = await Promise.all([
    getServerSession(),
    apiServer<{ retentionYears: RetentionYears }>("/data/settings"),
    apiServer<{ items: ExportRow[] }>("/data/exports"),
    apiServer<{ id: string; name: string; members: { userId: string; role: string }[] }>(
      "/auth/organization/get-full-organization",
    ),
  ])
  if (settings.status === 403) {
    return (
      <Alert tone="info" title="Owners and admins only">
        Data retention and exports cover every envelope in the workspace, so only owners and admins
        can manage them.
      </Alert>
    )
  }
  const isOwner = Boolean(
    org.data?.members
      .find((m) => m.userId === session?.user.id)
      ?.role.split(",")
      .includes("owner"),
  )

  return (
    <div className="flex flex-col gap-6">
      <Panel
        title="Retention"
        description="How long signed agreements are kept (Kenya Data Protection Act: keep personal data only as long as needed)."
      >
        <RetentionForm initial={settings.data?.retentionYears ?? null} />
      </Panel>

      <Panel
        title="Export"
        description="A ZIP with every sent envelope: details and recipients (JSON), the audit trail with its verification, the original, signed PDF and certificate. Downloads are kept for 7 days."
      >
        <ExportsPanel exports={exports.data?.items ?? []} />
      </Panel>

      {isOwner && org.data && (
        <Panel
          className="border-destructive/30"
          title="Delete workspace"
          description={`Permanently deletes ${org.data.name} and all of its data, files and members.`}
        >
          <div>
            <DeleteWorkspace id={org.data.id} name={org.data.name} />
          </div>
        </Panel>
      )}
    </div>
  )
}
