import type { TemplateForUse } from "@sahihi/core"
import { notFound } from "next/navigation"
import { Breadcrumb } from "@/components/arc/breadcrumb/breadcrumb"
import { apiServer } from "@/lib/api-server"
import { BulkSendForm } from "./bulk-send-form"

interface TemplateDetail extends TemplateForUse {
  id: string
  name: string
}

export const metadata = { title: "Bulk send" }

/** One template to many people (docs/bulk-send.md). */
export default async function BulkSendPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const { status, data } = await apiServer<{ template: TemplateDetail }>(
    `/templates/${encodeURIComponent(id)}`,
  )
  if (status === 404 || !data) notFound()
  const t = data.template
  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-8">
      <header className="flex flex-col gap-2">
        <Breadcrumb
          items={[{ label: "All files", href: "/files?type=template" }, { label: t.name }]}
        />
        <h1 className="font-medium text-2xl tracking-tight">Bulk send</h1>
        <p className="text-muted-foreground text-sm">
          From <span className="text-foreground">{t.name}</span>. Each row of your CSV becomes its
          own envelope, sent right away, and counts towards your plan's monthly envelopes.
        </p>
      </header>
      <BulkSendForm
        templateId={t.id}
        templateName={t.name}
        template={{ signingOrder: t.signingOrder, roles: t.roles, fields: t.fields }}
      />
    </div>
  )
}
