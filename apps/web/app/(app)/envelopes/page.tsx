import type { EnvelopeStatus, UsageLevel } from "@sahihi/core"
import { PlusIcon, SendIcon } from "lucide-react"
import Link from "next/link"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardPanel } from "@/components/ui/card"
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { apiServer } from "@/lib/api-server"
import { quotaBanner } from "@/lib/billing"
import { ENVELOPE_STATUS_BADGE } from "@/lib/constants"

interface EnvelopeRow {
  id: string
  title: string
  status: EnvelopeStatus
  createdAt: string
  document: { name: string }
  recipients: { id: string; name: string; status: string; role: string }[]
}

export const metadata = { title: "Envelopes" }

export default async function EnvelopesPage() {
  const [{ data }, { data: billing }] = await Promise.all([
    apiServer<{ items: EnvelopeRow[] }>("/envelopes"),
    apiServer<{
      period: { end: string }
      envelopes: { used: number; limit: number | null; level: UsageLevel }
    }>("/billing"),
  ])
  const items = data?.items ?? []
  const banner = billing
    ? quotaBanner(
        billing.envelopes.level,
        billing.envelopes.used,
        billing.envelopes.limit,
        new Intl.DateTimeFormat("en-GB", {
          day: "numeric",
          month: "long",
          timeZone: "Africa/Nairobi",
        }).format(new Date(billing.period.end)),
      )
    : null
  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between gap-4">
        <h1 className="font-semibold text-xl">Envelopes</h1>
        <Button render={<Link href="/envelopes/new" />}>
          <PlusIcon aria-hidden />
          New envelope
        </Button>
      </div>
      {banner && (
        <Alert variant={banner.variant}>
          <AlertTitle>{banner.title}</AlertTitle>
          <AlertDescription>
            {banner.description}{" "}
            <Link href="/settings/billing" className="underline">
              Plan &amp; usage
            </Link>
          </AlertDescription>
        </Alert>
      )}
      <Card>
        <CardPanel>
          {items.length === 0 ? (
            <Empty className="md:py-10">
              <EmptyHeader>
                <EmptyMedia variant="icon">
                  <SendIcon aria-hidden />
                </EmptyMedia>
                <EmptyTitle>No envelopes yet</EmptyTitle>
                <EmptyDescription>
                  Pick a document, add recipients and send it for signature.
                </EmptyDescription>
              </EmptyHeader>
              <EmptyContent>
                <Button render={<Link href="/envelopes/new" />}>New envelope</Button>
              </EmptyContent>
            </Empty>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Title</TableHead>
                  <TableHead>Document</TableHead>
                  <TableHead>Signed</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {items.map((e) => {
                  const signers = e.recipients.filter((r) => r.role !== "VIEWER")
                  const badge = ENVELOPE_STATUS_BADGE[e.status]
                  return (
                    <TableRow key={e.id}>
                      <TableCell className="font-medium">
                        <Link href={`/envelopes/${e.id}`} className="hover:underline">
                          {e.title}
                        </Link>
                      </TableCell>
                      <TableCell>{e.document.name}</TableCell>
                      <TableCell>
                        {signers.filter((r) => r.status === "SIGNED").length}/{signers.length}
                      </TableCell>
                      <TableCell>
                        <Badge variant={badge.variant}>{badge.label}</Badge>
                      </TableCell>
                    </TableRow>
                  )
                })}
              </TableBody>
            </Table>
          )}
        </CardPanel>
      </Card>
    </div>
  )
}
