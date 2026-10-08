import Link from "next/link"
import { notFound, redirect } from "next/navigation"
import { DownloadButtons } from "@/components/app/downloads/download-buttons"
import {
  ActivityList,
  type AuditEventRow,
  type ChainVerification,
} from "@/components/app/envelope/activity-list"
import { EnvelopeDocumentsPanel } from "@/components/app/envelope/envelope-documents-panel"
import { EnvelopeTabs } from "@/components/app/envelope/envelope-tabs"
import { PurgeEnvelope } from "@/components/app/envelope/purge-envelope"
import {
  EnvelopeHeaderActions,
  RecipientActionsMenu,
} from "@/components/app/envelope/sender-actions"
import { Panel } from "@/components/app/panel"
import { SaveTemplateDialog } from "@/components/app/templates/save-template-dialog"
import { Alert } from "@/components/arc/alert/alert"
import { Badge } from "@/components/arc/badge/badge"
import { Breadcrumb } from "@/components/arc/breadcrumb/breadcrumb"
import { Progress } from "@/components/arc/progress/progress"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { apiServer } from "@/lib/api-server"
import { ENVELOPE_STATUS_BADGE, RECIPIENT_STATUS_BADGE } from "@/lib/constants"
import { type EnvelopeResponse, isEditableDraft } from "@/lib/envelope-detail"
import { documentsLine } from "@/lib/envelope-documents"
import { recipientSummary, signingProgress } from "@/lib/envelope-list"
import { formatDate } from "@/lib/format"
import { ROLE_LABELS, VERIFICATION_LABELS } from "@/lib/recipients"

/**
 * Envelope detail, read-only: header (status badge, void/purge) + Tabs. An editable draft opens
 * in the draft editor instead (`/envelopes/:id/edit`, ADR 0021).
 *  - Document:   the original, as sent for signing.
 *  - Recipients: a status table.
 *  - Activity:   the hash-chained audit trail.
 */
export default async function EnvelopePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const path = `/envelopes/${encodeURIComponent(id)}`
  const [{ status, data }, audit] = await Promise.all([
    apiServer<EnvelopeResponse>(path),
    apiServer<{ events: AuditEventRow[]; verification: ChainVerification }>(`${path}/audit`),
  ])
  if (status === 404 || !data) notFound()
  if (isEditableDraft(data)) redirect(`${path}/edit`)
  const e = data.envelope
  const badge = ENVELOPE_STATUS_BADGE[e.status]
  // Members change only envelopes they created; owners and admins change any (docs/auth.md).
  const canManage = data.permissions.manage
  const open = e.status === "DRAFT" || e.status === "SENT" || e.status === "IN_PROGRESS"
  const sequential = e.signingOrder === "SEQUENTIAL"
  const purged = Boolean(e.purgedAt)
  // Each original PDF (presigned, short-lived), in signing order.
  const urls = purged
    ? []
    : await Promise.all(
        e.documents.map((d) =>
          apiServer<{ url: string }>(`/documents/${encodeURIComponent(d.documentId)}/file`),
        ),
      )
  const recipientNames = Object.fromEntries(e.recipients.map((r) => [r.id, r.name]))

  const documentPanel = (
    <Panel
      title={
        e.documents.length > 1 ? documentsLine(e.documents) : (e.documents[0]?.name ?? "Document")
      }
      description={`${e.documents.length > 1 ? "" : `${documentsLine(e.documents)} · `}${e.fields.length} fields · ${e.status === "DRAFT" ? "not sent yet" : "the originals, as sent for signing"}`}
    >
      {purged ? (
        <p className="text-muted-foreground text-sm">
          The documents and files were deleted under the data retention policy. Their hashes are
          kept on the certificate and in the Activity log.
        </p>
      ) : (
        <EnvelopeDocumentsPanel
          envelopeId={e.id}
          documents={e.documents.map((d, i) => ({
            id: d.id,
            name: d.name,
            pageCount: d.pageCount,
            url: urls[i]?.data?.url ?? null,
          }))}
          attachments={e.attachments}
        />
      )}
    </Panel>
  )

  const recipientsPanel = (
    // The tab already says "Recipients"; the panel only adds how they're invited.
    <Panel
      description={
        sequential
          ? "Invited step by step. Recipients on the same step sign in parallel."
          : "Everyone is invited at the same time."
      }
    >
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
                <Badge tone={RECIPIENT_STATUS_BADGE[r.status].tone} size="sm">
                  {RECIPIENT_STATUS_BADGE[r.status].label}
                </Badge>
              </TableCell>
              <TableCell>
                <RecipientActionsMenu
                  envelopeId={e.id}
                  envelopeStatus={e.status}
                  recipient={r}
                  canRemind={canManage}
                />
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </Panel>
  )

  const activityPanel = (
    <Panel>
      {audit.data ? (
        <ActivityList
          events={audit.data.events}
          verification={audit.data.verification}
          recipientNames={recipientNames}
          now={Date.now()}
        />
      ) : (
        <p className="text-muted-foreground text-sm">The activity log could not be loaded.</p>
      )}
    </Panel>
  )

  // Anyone who can see the envelope may copy it into a template (the envelope isn't changed).
  const saveTemplate =
    e.recipients.length > 0 && !purged ? (
      <SaveTemplateDialog envelopeId={e.id} envelopeTitle={e.title} recipients={e.recipients} />
    ) : null

  const progress = signingProgress(e.recipients)
  const waitingOn = e.recipients.filter(
    (r) => r.role !== "VIEWER" && (r.status === "SENT" || r.status === "VIEWED"),
  )
  const heading = (
    <div className="flex min-w-0 flex-col gap-2">
      <div className="flex min-w-0 items-center gap-3">
        <h1 className="truncate font-medium text-2xl tracking-tight" title={e.title}>
          {e.title}
        </h1>
        <Badge tone={badge.tone}>{badge.label}</Badge>
      </div>
      <p className="text-muted-foreground text-sm">
        {sequential ? "Signing in order" : "Signing in parallel"}
        {e.expiresAt ? ` · Expires ${formatDate(new Date(e.expiresAt))}` : " · No expiry"}
      </p>
    </div>
  )

  // While it's out for signature: how far along it is, and who it's waiting on.
  const signingStatus =
    (e.status === "SENT" || e.status === "IN_PROGRESS") && progress.total > 0 ? (
      <section
        aria-label="Signing progress"
        className="flex flex-col gap-3 rounded-2xl border p-5 sm:flex-row sm:items-center sm:gap-8"
      >
        <div className="w-full sm:max-w-xs">
          <Progress
            value={progress.signed}
            max={progress.total}
            label={`${progress.signed} of ${progress.total} signed`}
          />
        </div>
        {waitingOn.length > 0 && (
          <p className="text-muted-foreground text-sm">
            Waiting for{" "}
            <span className="text-foreground">
              {recipientSummary(waitingOn.map((r) => r.name))}
            </span>
          </p>
        )}
      </section>
    ) : null

  return (
    <div className="flex flex-col gap-6">
      <Breadcrumb items={[{ label: "Envelopes", href: "/envelopes" }, { label: e.title }]} />

      <div className="flex flex-wrap items-center justify-between gap-3">
        {heading}
        <EnvelopeHeaderActions
          envelopeId={e.id}
          canVoid={canManage}
          actions={
            <>
              {saveTemplate}
              {data.permissions.purge && <PurgeEnvelope envelopeId={e.id} />}
            </>
          }
          summary={{
            title: e.title,
            status: e.status,
            expiresAt: e.expiresAt,
            recipients: e.recipients,
          }}
        />
      </div>

      {signingStatus}

      {!canManage && open && (
        <Alert tone="info" title="View only">
          Only the member who created this envelope, an admin or the owner can edit, send, remind or
          void it.
        </Alert>
      )}

      {purged && e.purgedAt && (
        <Alert tone="info" title="Files and personal data deleted">
          On {formatDate(new Date(e.purgedAt))}, under the data retention policy. The status,
          hashes, certificate code and audit trail are kept as evidence.
        </Alert>
      )}

      {e.status === "COMPLETED" && !purged && (
        <Panel
          title="Signed and certified"
          description={
            e.certificate
              ? `Everyone signed${e.completedAt ? ` on ${formatDate(new Date(e.completedAt))}` : ""}. ${e.documents.length > 1 ? `The ${e.documents.length} signed PDFs` : "The signed PDF"} and the Certificate of Completion are ready.`
              : "Everyone has signed. The signed PDF and certificate are being produced; refresh in a moment."
          }
        >
          {e.certificate && (
            <div className="flex flex-wrap items-center justify-between gap-4">
              <DownloadButtons
                endpoint={`/envelopes/${e.id}/downloads`}
                documents={e.documents}
                attachments={e.attachments.filter((a) => a.status === "READY")}
              />
              <p className="text-muted-foreground text-sm">
                Certificate{" "}
                <span className="font-medium font-mono text-foreground">{e.certificate.code}</span>
                {" · "}
                <Link href={`/verify/${e.certificate.code}`} className="underline" target="_blank">
                  Public verification page
                </Link>
              </p>
            </div>
          )}
        </Panel>
      )}

      <EnvelopeTabs
        defaultTab="document"
        counts={{ recipients: e.recipients.length, activity: audit.data?.events.length }}
        panels={{ document: documentPanel, recipients: recipientsPanel, activity: activityPanel }}
      />
    </div>
  )
}
