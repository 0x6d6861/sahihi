import { ButtonLink } from "@/components/app/button-link"
import { DownloadIcon, PackageIcon } from "@/components/app/icons"
import { SettingsSection } from "@/components/app/settings/settings-section"
import { AddConnectionButton } from "@/components/app/storage/add-connection-button"
import { CloudDriveButton } from "@/components/app/storage/cloud-drive-button"
import { ConnectionCard } from "@/components/app/storage/connection-card"
import type { AwsRoleSetup } from "@/components/app/storage/connection-form-dialog"
import { ReleasedFiles, type ReleaseRow } from "@/components/app/storage/released-files"
import { Alert } from "@/components/arc/alert/alert"
import { EmptyState } from "@/components/arc/empty-state/empty-state"
import { apiServer } from "@/lib/api-server"
import type { StorageConnectionRow } from "@/lib/storage"

export const metadata = { title: "Storage" }

interface StorageOverview {
  plan: {
    id: string
    name: string
    ownStorage: "none" | "sync" | "primary"
    storageDestinations: number
  }
  connections: StorageConnectionRow[]
  releasedCount: number
  awsRole: AwsRoleSetup | null
  oauth: { GOOGLE_DRIVE: boolean; ONEDRIVE: boolean }
}

/**
 * The workspace's own storage (docs/storage.md, ADR 0051): sync destinations (Business and up)
 * and primary storage (Enterprise). Owners and admins.
 */
export default async function StoragePage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const query = await searchParams
  const [overview, releases] = await Promise.all([
    apiServer<StorageOverview>("/storage"),
    apiServer<{ items: ReleaseRow[]; nextCursor: string | null }>("/storage/releases"),
  ])
  if (overview.status === 403) {
    return (
      <Alert tone="info" title="Owners and admins only">
        Connected storage receives the workspace's files, so only owners and admins can manage it.
      </Alert>
    )
  }
  const data = overview.data
  if (!data) {
    return (
      <Alert tone="danger" title="Storage settings didn't load">
        Refresh the page to try again.
      </Alert>
    )
  }
  const { plan } = data
  const sync = data.connections.filter((c) => c.purpose === "SYNC")
  const primary = data.connections.find((c) => c.purpose === "PRIMARY") ?? null
  const syncFull = sync.length >= plan.storageDestinations
  const error = typeof query.error === "string" ? query.error : null
  const connected = typeof query.connected === "string"

  return (
    <div className="flex flex-col gap-6">
      {error && (
        <Alert tone="danger" title="Not connected">
          {error}
        </Alert>
      )}
      {connected && !error && (
        <Alert tone="success" title="Connected">
          Completed envelopes are now copied there.
        </Alert>
      )}

      <section className="flex flex-col gap-4">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex flex-col gap-1">
            <h2 className="font-medium text-lg">Sync</h2>
            <p className="text-muted-foreground text-sm">
              When everyone has signed, Sahihi copies the signed PDFs, the certificate and the audit
              trail to your own storage. Sahihi never deletes anything there.
              {plan.ownStorage !== "none" &&
                ` ${sync.length} of ${plan.storageDestinations} ${plan.storageDestinations === 1 ? "destination" : "destinations"} in use on the ${plan.name} plan${syncFull ? ": disconnect one to connect another" : ""}.`}
            </p>
          </div>
          {plan.ownStorage !== "none" && (
            <div className="flex flex-wrap gap-2">
              {data.oauth.GOOGLE_DRIVE && (
                <CloudDriveButton provider="GOOGLE_DRIVE" disabled={syncFull} />
              )}
              {data.oauth.ONEDRIVE && <CloudDriveButton provider="ONEDRIVE" disabled={syncFull} />}
              <AddConnectionButton
                purpose="SYNC"
                awsRole={data.awsRole}
                label="Connect a bucket"
                disabled={syncFull}
              />
            </div>
          )}
        </div>
        {plan.ownStorage === "none" ? (
          <PlanRequired
            title="Sync is on the Business plan"
            description="Copy every signed agreement to Amazon S3, Cloudflare R2, Backblaze B2, Google Drive, OneDrive and more."
          />
        ) : sync.length === 0 ? (
          <SettingsSection>
            <EmptyState
              className="md:py-10"
              icon={<PackageIcon aria-hidden />}
              title="No sync destinations yet"
              description="Connect a bucket or a cloud drive to keep every signed agreement in your own system of record."
            />
          </SettingsSection>
        ) : (
          sync.map((c) => <ConnectionCard key={c.id} connection={c} />)
        )}
      </section>

      <section className="flex flex-col gap-4">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex flex-col gap-1">
            <h2 className="font-medium text-lg">Primary storage</h2>
            <p className="text-muted-foreground text-sm">
              Keep every file of this workspace in your own bucket instead of Sahihi's: documents,
              signed PDFs, certificates and exports. Sahihi reads and writes there, never deletes,
              and lists files it no longer uses so you can clean up.
            </p>
          </div>
          {plan.ownStorage === "primary" && !primary && (
            <AddConnectionButton
              purpose="PRIMARY"
              awsRole={data.awsRole}
              label="Connect a bucket"
            />
          )}
        </div>
        {plan.ownStorage !== "primary" ? (
          <PlanRequired
            title="Primary storage is on the Enterprise plan"
            description="Keep every document, signed PDF and certificate in your own bucket instead of Sahihi's."
          />
        ) : primary ? (
          <ConnectionCard connection={primary} />
        ) : null}
      </section>

      {(primary || data.releasedCount > 0) && (
        <section className="flex flex-col gap-4">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div className="flex flex-col gap-1">
              <h2 className="font-medium text-lg">Released files</h2>
              <p className="text-muted-foreground text-sm">
                Files in your bucket that Sahihi no longer uses. Sahihi never deletes them: clean up
                with a lifecycle rule (they're tagged sahihi=released on Amazon S3) or a script from
                the CSV.
              </p>
            </div>
            {data.releasedCount > 0 && (
              <ButtonLink href="/api/storage/releases.csv" prefetch={false} variant="secondary">
                <DownloadIcon aria-hidden />
                Download CSV
              </ButtonLink>
            )}
          </div>
          <SettingsSection>
            <ReleasedFiles
              initial={releases.data?.items ?? []}
              nextCursor={releases.data?.nextCursor ?? null}
            />
          </SettingsSection>
        </section>
      )}
    </div>
  )
}

/** A section the plan doesn't include: the same empty state for both tiers, one way forward. */
function PlanRequired({ title, description }: { title: string; description: string }) {
  return (
    <SettingsSection>
      <EmptyState
        className="md:py-10"
        icon={<PackageIcon aria-hidden />}
        title={title}
        description={description}
        action={
          <ButtonLink href="/settings/billing" variant="secondary">
            See plans
          </ButtonLink>
        }
      />
    </SettingsSection>
  )
}
