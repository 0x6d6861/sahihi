import type {
  EnvelopeStatus,
  FieldType,
  NormalizedRect,
  RecipientStatus,
  SigningOrder,
} from "@sahihi/core"
import Link from "next/link"
import { notFound } from "next/navigation"
import { DocumentViewer } from "@/components/app/document-viewer"
import { DownloadButtons } from "@/components/app/downloads/download-buttons"
import {
  ActivityList,
  type AuditEventRow,
  type ChainVerification,
} from "@/components/app/envelope/activity-list"
import { DraftStateProvider } from "@/components/app/envelope/draft-state"
import { type EnvelopeTab, EnvelopeTabs } from "@/components/app/envelope/envelope-tabs"
import { SendControl } from "@/components/app/envelope/send-control"
import {
  EnvelopeHeaderActions,
  RecipientActionsMenu,
} from "@/components/app/envelope/sender-actions"
import { FieldEditor } from "@/components/app/field-editor/field-editor"
import { RecipientsEditor } from "@/components/app/recipients-editor/recipients-editor"
import { Badge } from "@/components/ui/badge"
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb"
import { Card, CardDescription, CardHeader, CardPanel, CardTitle } from "@/components/ui/card"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { apiServer } from "@/lib/api-server"
import { ENVELOPE_STATUS_BADGE } from "@/lib/constants"
import { ROLE_LABELS, type SavedRecipient, VERIFICATION_LABELS } from "@/lib/recipients"

interface EnvelopeDetail {
  id: string
  title: string
  status: EnvelopeStatus
  signingOrder: SigningOrder
  expiresAt: string | null
  document: { id: string; name: string; pageCount: number; pages: { rotation: number }[] | null }
  recipients: (SavedRecipient & {
    status: RecipientStatus
    colorIndex: number
    notifiedAt: string | null
    lastRemindedAt: string | null
    signedAt: string | null
  })[]
  fields: (NormalizedRect & {
    id: string
    recipientId: string
    type: FieldType
    page: number
    required: boolean
    label: string | null
  })[]
  completedAt: string | null
  /** Set by the finalize job, shortly after COMPLETED. */
  certificate: { code: string; issuedAt: string; provider: "INTERNAL" | "CA" } | null
}

const dateLabel = new Intl.DateTimeFormat("en-GB", {
  dateStyle: "medium",
  timeZone: "Africa/Nairobi",
})

/**
 * Envelope detail: header (status badge, Send while drafting) + Tabs.
 *  - Document:   field editor (DRAFT) or the read-only original.
 *  - Recipients: recipients editor (DRAFT) or a status table.
 *  - Activity:   the hash-chained audit trail.
 */
export default async function EnvelopePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const path = `/envelopes/${encodeURIComponent(id)}`
  const [{ status, data }, audit] = await Promise.all([
    apiServer<{ envelope: EnvelopeDetail }>(path),
    apiServer<{ events: AuditEventRow[]; verification: ChainVerification }>(`${path}/audit`),
  ])
  if (status === 404 || !data) notFound()
  const e = data.envelope
  const badge = ENVELOPE_STATUS_BADGE[e.status]
  const draft = e.status === "DRAFT"
  const sequential = e.signingOrder === "SEQUENTIAL"
  // The original PDF (presigned, short-lived): field editor while drafting, viewer afterwards.
  const file = await apiServer<{ url: string }>(
    `/documents/${encodeURIComponent(e.document.id)}/file`,
  )
  const fieldOwners = e.recipients
    .filter((r) => r.role !== "VIEWER")
    .map((r) => ({ id: r.id, name: r.name, colorIndex: r.colorIndex }))
  const recipientNames = Object.fromEntries(e.recipients.map((r) => [r.id, r.name]))
  const defaultTab: EnvelopeTab = draft && fieldOwners.length === 0 ? "recipients" : "document"

  const documentPanel = (
    <Card>
      <CardHeader>
        <CardTitle>{e.document.name}</CardTitle>
        <CardDescription>
          {e.document.pageCount} {e.document.pageCount === 1 ? "page" : "pages"}
          {draft
            ? " · Pick a field type, then click or drag on a page."
            : ` · ${e.fields.length} fields · the original, as sent for signing`}
        </CardDescription>
      </CardHeader>
      <CardPanel>
        {!file.data ? (
          <p className="text-muted-foreground text-sm">The document could not be loaded.</p>
        ) : !draft ? (
          <DocumentViewer src={file.data.url} fileName={e.document.name} />
        ) : fieldOwners.length === 0 ? (
          <p className="text-muted-foreground text-sm">
            Add a recipient who signs or approves on the Recipients tab, then place their fields
            here.
          </p>
        ) : (
          <FieldEditor
            envelopeId={e.id}
            src={file.data.url}
            fileName={e.document.name}
            recipients={fieldOwners}
            initialFields={e.fields}
            pageRotations={(e.document.pages ?? []).map((p) => p.rotation)}
          />
        )}
      </CardPanel>
    </Card>
  )

  const recipientsPanel = (
    <Card>
      <CardHeader>
        <CardTitle>Recipients</CardTitle>
        <CardDescription>
          {sequential
            ? "Invited step by step. Recipients on the same step sign in parallel."
            : "Everyone is invited at the same time."}
        </CardDescription>
      </CardHeader>
      <CardPanel>
        {draft ? (
          <RecipientsEditor
            envelopeId={e.id}
            signingOrder={e.signingOrder}
            initial={e.recipients}
          />
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                {sequential && <TableHead>Step</TableHead>}
                <TableHead>Name</TableHead>
                <TableHead>Role</TableHead>
                <TableHead>Verification</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="w-10">
                  <span className="sr-only">Actions</span>
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {e.recipients.map((r) => (
                <TableRow key={r.id}>
                  {sequential && <TableCell>{r.order}</TableCell>}
                  <TableCell>
                    <div className="font-medium">{r.name}</div>
                    <div className="text-muted-foreground text-xs">{r.email}</div>
                  </TableCell>
                  <TableCell>{ROLE_LABELS[r.role]}</TableCell>
                  <TableCell>{VERIFICATION_LABELS[r.verification]}</TableCell>
                  <TableCell>
                    <Badge variant="outline">{r.status.toLowerCase()}</Badge>
                  </TableCell>
                  <TableCell>
                    <RecipientActionsMenu
                      envelopeId={e.id}
                      envelopeStatus={e.status}
                      recipient={r}
                    />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </CardPanel>
    </Card>
  )

  const activityPanel = (
    <Card>
      <CardPanel>
        {audit.data ? (
          <ActivityList
            events={audit.data.events}
            verification={audit.data.verification}
            recipientNames={recipientNames}
          />
        ) : (
          <p className="text-muted-foreground text-sm">The activity log could not be loaded.</p>
        )}
      </CardPanel>
    </Card>
  )

  const heading = (
    <div className="flex min-w-0 flex-col gap-1">
      <div className="flex items-center gap-3">
        <h1 className="truncate font-semibold text-xl">{e.title}</h1>
        <Badge variant={badge.variant}>{badge.label}</Badge>
      </div>
      <p className="text-muted-foreground text-sm">
        {sequential ? "Signing in order" : "Signing in parallel"}
        {e.expiresAt ? ` · Expires ${dateLabel.format(new Date(e.expiresAt))}` : " · No expiry"}
      </p>
    </div>
  )

  return (
    <DraftStateProvider>
      <div className="flex flex-col gap-6">
        <Breadcrumb>
          <BreadcrumbList>
            <BreadcrumbItem>
              <BreadcrumbLink render={<Link href="/envelopes" />}>Envelopes</BreadcrumbLink>
            </BreadcrumbItem>
            <BreadcrumbSeparator />
            <BreadcrumbItem>
              <BreadcrumbPage className="max-w-64 truncate">{e.title}</BreadcrumbPage>
            </BreadcrumbItem>
          </BreadcrumbList>
        </Breadcrumb>

        {draft ? (
          <SendControl
            envelopeId={e.id}
            recipientCount={e.recipients.length}
            defaultTab={defaultTab}
          >
            {heading}
          </SendControl>
        ) : (
          <div className="flex flex-wrap items-center justify-between gap-3">
            {heading}
            <EnvelopeHeaderActions
              envelopeId={e.id}
              summary={{
                title: e.title,
                status: e.status,
                expiresAt: e.expiresAt,
                recipients: e.recipients,
              }}
            />
          </div>
        )}

        {e.status === "COMPLETED" && (
          <Card>
            <CardHeader>
              <CardTitle>Signed and certified</CardTitle>
              <CardDescription>
                {e.certificate
                  ? `Everyone signed${e.completedAt ? ` on ${dateLabel.format(new Date(e.completedAt))}` : ""}. The signed PDF and the Certificate of Completion are ready.`
                  : "Everyone has signed. The signed PDF and certificate are being produced; refresh in a moment."}
              </CardDescription>
            </CardHeader>
            {e.certificate && (
              <CardPanel className="flex flex-wrap items-center justify-between gap-4">
                <DownloadButtons endpoint={`/envelopes/${e.id}/downloads`} />
                <p className="text-muted-foreground text-sm">
                  Certificate{" "}
                  <span className="font-medium font-mono text-foreground">
                    {e.certificate.code}
                  </span>
                  {" · "}
                  <Link
                    href={`/verify/${e.certificate.code}`}
                    className="underline"
                    target="_blank"
                  >
                    Public verification page
                  </Link>
                </p>
              </CardPanel>
            )}
          </Card>
        )}

        <EnvelopeTabs
          defaultTab={defaultTab}
          keepMounted={draft}
          counts={{ recipients: e.recipients.length, activity: audit.data?.events.length }}
          panels={{ document: documentPanel, recipients: recipientsPanel, activity: activityPanel }}
        />
      </div>
    </DraftStateProvider>
  )
}
