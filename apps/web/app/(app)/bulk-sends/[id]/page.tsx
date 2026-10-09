import { notFound } from "next/navigation"
import { Panel } from "@/components/app/panel"
import { Breadcrumb } from "@/components/arc/breadcrumb/breadcrumb"
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
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-8">
      <header className="flex flex-col gap-2">
        <Breadcrumb
          items={[{ label: "Inbox", href: "/inbox?tab=bulk-sends" }, { label: "Bulk send" }]}
        />
        {/* The batch title is a pattern ("…: {{Tenant name}}"), so the template names the page. */}
        <h1 className="truncate font-medium text-2xl tracking-tight">
          {b.template ? `Bulk send: ${b.template.name}` : "Bulk send"}
        </h1>
        <p className="text-muted-foreground text-sm">
          {b.total} {b.total === 1 ? "envelope" : "envelopes"}, titled “{b.title}”
          {b.template ? "" : ". The template has since been deleted"}
        </p>
      </header>
      <Panel>
        <BulkProgress bulk={b} />
      </Panel>
    </div>
  )
}
