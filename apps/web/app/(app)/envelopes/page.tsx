import type { EnvelopeStatus } from "@sahihi/core"
import { PlusIcon, SendIcon } from "lucide-react"
import Link from "next/link"
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
  const { data } = await apiServer<{ items: EnvelopeRow[] }>("/envelopes")
  const items = data?.items ?? []
  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between gap-4">
        <h1 className="font-semibold text-xl">Envelopes</h1>
        <Button render={<Link href="/envelopes/new" />}>
          <PlusIcon aria-hidden />
          New envelope
        </Button>
      </div>
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
