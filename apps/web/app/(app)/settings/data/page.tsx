import type { RetentionYears } from "@sahihi/core"
import { DeleteWorkspace } from "@/components/app/data/delete-workspace"
import { type ExportRow, ExportsPanel } from "@/components/app/data/exports-panel"
import { RetentionForm } from "@/components/app/data/retention-form"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Card, CardDescription, CardHeader, CardPanel, CardTitle } from "@/components/ui/card"
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
      <Alert variant="info">
        <AlertTitle>Owners and admins only</AlertTitle>
        <AlertDescription>
          Data retention and exports cover every envelope in the workspace, so only owners and
          admins can manage them.
        </AlertDescription>
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
      <Card>
        <CardHeader>
          <CardTitle>Retention</CardTitle>
          <CardDescription>
            How long signed agreements are kept (Kenya Data Protection Act: keep personal data only
            as long as needed).
          </CardDescription>
        </CardHeader>
        <CardPanel>
          <RetentionForm initial={settings.data?.retentionYears ?? null} />
        </CardPanel>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Export</CardTitle>
          <CardDescription>
            A ZIP with every sent envelope: details and recipients (JSON), the audit trail with its
            verification, the original, signed PDF and certificate. Downloads are kept for 7 days.
          </CardDescription>
        </CardHeader>
        <CardPanel>
          <ExportsPanel exports={exports.data?.items ?? []} />
        </CardPanel>
      </Card>

      {isOwner && org.data && (
        <Card className="border-destructive/32">
          <CardHeader>
            <CardTitle>Delete workspace</CardTitle>
            <CardDescription>
              Permanently deletes {org.data.name} and all of its data, files and members.
            </CardDescription>
          </CardHeader>
          <CardPanel>
            <DeleteWorkspace id={org.data.id} name={org.data.name} />
          </CardPanel>
        </Card>
      )}
    </div>
  )
}
