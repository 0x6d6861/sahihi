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
import { UseTemplateForm } from "./use-template-form"

interface TemplateDetail extends TemplateForUse {
  id: string
  name: string
  description: string | null
  message: string | null
  document: { id: string; name: string; pageCount: number }
}

export const metadata = { title: "Use template" }

/** Step 1 from a template: who signs → DRAFT envelope, then the usual envelope page. */
export default async function UseTemplatePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const { status, data } = await apiServer<{ template: TemplateDetail }>(
    `/templates/${encodeURIComponent(id)}`,
  )
  if (status === 404 || !data) notFound()
  const t = data.template

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-6">
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
          <CardTitle>New envelope from “{t.name}”</CardTitle>
          <CardDescription>
            {t.document.name} · {t.document.pageCount}{" "}
            {t.document.pageCount === 1 ? "page" : "pages"} · {t.fields.length}{" "}
            {t.fields.length === 1 ? "field" : "fields"}. You can still adjust fields and recipients
            before sending.
          </CardDescription>
        </CardHeader>
        <CardPanel>
          <UseTemplateForm
            templateId={t.id}
            defaultTitle={t.name}
            defaultMessage={t.message ?? ""}
            template={{ signingOrder: t.signingOrder, roles: t.roles, fields: t.fields }}
          />
        </CardPanel>
      </Card>
    </div>
  )
}
