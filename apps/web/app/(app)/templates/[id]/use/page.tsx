import type { TemplateForUse } from "@sahihi/core"
import { notFound } from "next/navigation"
import { Breadcrumb } from "@/components/arc/breadcrumb/breadcrumb"
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

  const pages = `${t.document.pageCount} ${t.document.pageCount === 1 ? "page" : "pages"}`
  const fields = `${t.fields.length} ${t.fields.length === 1 ? "field" : "fields"}`

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-8">
      <header className="flex flex-col gap-2">
        <Breadcrumb items={[{ label: "Templates", href: "/templates" }, { label: t.name }]} />
        <h1 className="font-medium text-2xl tracking-tight">New envelope</h1>
        <p className="text-muted-foreground text-sm">
          From <span className="text-foreground">{t.name}</span>: {t.document.name}, {pages},{" "}
          {fields}. You can still adjust fields and recipients before sending.
        </p>
      </header>
      <UseTemplateForm
        templateId={t.id}
        defaultTitle={t.name}
        defaultMessage={t.message ?? ""}
        template={{ signingOrder: t.signingOrder, roles: t.roles, fields: t.fields }}
      />
    </div>
  )
}
