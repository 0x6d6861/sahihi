import type { TemplateForUse } from "@sahihi/core"
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
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-6">
      <Breadcrumb>
        <BreadcrumbList>
          <BreadcrumbItem>
            <BreadcrumbLink render={<Link href="/templates" />}>Templates</BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem>
            <BreadcrumbPage className="max-w-64 truncate">{t.name}</BreadcrumbPage>
          </BreadcrumbItem>
        </BreadcrumbList>
      </Breadcrumb>
      <Card>
        <CardHeader>
          <CardTitle>Bulk send “{t.name}”</CardTitle>
          <CardDescription>
            Each row becomes its own envelope, sent right away. Each counts towards your plan's
            monthly envelopes.
          </CardDescription>
        </CardHeader>
        <CardPanel>
          <BulkSendForm
            templateId={t.id}
            templateName={t.name}
            template={{ signingOrder: t.signingOrder, roles: t.roles, fields: t.fields }}
          />
        </CardPanel>
      </Card>
    </div>
  )
}
