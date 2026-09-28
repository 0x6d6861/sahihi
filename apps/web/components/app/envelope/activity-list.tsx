import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Badge } from "@/components/ui/badge"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { auditEventLabel, auditEventTone } from "@/lib/audit-labels"
import { cn } from "@/lib/utils"

const DOT: Record<ReturnType<typeof auditEventTone>, string> = {
  success: "bg-success",
  error: "bg-destructive",
  warning: "bg-warning",
  info: "bg-info",
  outline: "bg-muted-foreground/40",
}

export interface AuditEventRow {
  seq: number
  type: string
  recipientId: string | null
  actorUserId: string | null
  data: Record<string, unknown> | null
  ipAddress: string | null
  occurredAt: string
}

export type ChainVerification =
  | { valid: true }
  | { valid: false; brokenAtSeq: number; reason: string }

const when = new Intl.DateTimeFormat("en-GB", {
  dateStyle: "medium",
  timeStyle: "short",
  timeZone: "Africa/Nairobi",
})

/** The envelope's audit trail, newest first, with the hash-chain check the API ran. */
export function ActivityList({
  events,
  verification,
  recipientNames,
}: {
  events: AuditEventRow[]
  verification: ChainVerification
  recipientNames: Record<string, string>
}) {
  const rows = [...events].sort((a, b) => b.seq - a.seq)
  return (
    <div className="flex flex-col gap-4">
      {verification.valid ? (
        <p className="flex items-center gap-2 text-muted-foreground text-sm">
          <Badge variant="success">Verified</Badge>
          The audit trail is intact: {events.length} {events.length === 1 ? "event" : "events"},
          each hash-chained to the one before.
        </p>
      ) : (
        <Alert variant="error">
          <AlertTitle>Audit trail check failed</AlertTitle>
          <AlertDescription>
            The chain breaks at event #{verification.brokenAtSeq} ({verification.reason}). Contact
            support before relying on this envelope.
          </AlertDescription>
        </Alert>
      )}
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="w-12">#</TableHead>
            <TableHead>Event</TableHead>
            <TableHead>When (EAT)</TableHead>
            <TableHead>IP address</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((e) => (
            <TableRow key={e.seq}>
              <TableCell className="text-muted-foreground tabular-nums">{e.seq}</TableCell>
              <TableCell>
                <span className="flex items-center gap-2">
                  <span
                    aria-hidden
                    className={cn("size-2 shrink-0 rounded-full", DOT[auditEventTone(e.type)])}
                  />
                  {auditEventLabel(
                    e.type,
                    e.recipientId ? recipientNames[e.recipientId] : null,
                    e.data,
                  )}
                </span>
              </TableCell>
              <TableCell className="whitespace-nowrap">
                <time dateTime={e.occurredAt}>{when.format(new Date(e.occurredAt))}</time>
              </TableCell>
              <TableCell className="text-muted-foreground">{e.ipAddress ?? "—"}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  )
}
