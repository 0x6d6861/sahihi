import Link from "next/link"
import { notFound } from "next/navigation"
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb"
import { Card, CardDescription, CardHeader, CardPanel, CardTitle } from "@/components/ui/card"
import { apiServer } from "@/lib/api-server"
import { BulkProgress, type BulkSendView } from "./bulk-progress"

export const metadata = { title: "Bulk send" }

export default async function BulkSendStatusPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const { status, data } = await apiServer<{
    bulkSend: BulkSendView & { template: { name: string } | null }
  }>(`/bulk-sends/${encodeURIComponent(id)}`)
  if (status === 404 || !data) notFound()
  const b = data.bulkSend
  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-6">
      <Breadcrumb>
        <BreadcrumbList>
          <BreadcrumbItem>
            <BreadcrumbLink render={<Link href="/templates" />}>Templates</BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem>
            <BreadcrumbPage className="max-w-64 truncate">Bulk send</BreadcrumbPage>
          </BreadcrumbItem>
        </BreadcrumbList>
      </Breadcrumb>
      <Card>
        <CardHeader>
          <CardTitle>{b.title}</CardTitle>
          <CardDescription>
            {b.template ? `From “${b.template.name}”` : "From a deleted template"} · {b.total}{" "}
            {b.total === 1 ? "envelope" : "envelopes"}
          </CardDescription>
        </CardHeader>
        <CardPanel>
          <BulkProgress bulk={b} />
        </CardPanel>
      </Card>
    </div>
  )
}
