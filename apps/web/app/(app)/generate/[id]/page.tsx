import { notFound, redirect } from "next/navigation"
import { GeneratorShell } from "@/components/app/generator/generator-shell"
import { apiServer } from "@/lib/api-server"
import type { GeneratorDetail } from "@/lib/generator"

/** The AI document generator: a full page with its own bar (docs/ai-documents.md → Web). */
export default async function GeneratorPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const { status, data } = await apiServer<GeneratorDetail>(
    `/generated-documents/${encodeURIComponent(id)}`,
  )
  // 403: the assistant is off here; the list explains why.
  if (status === 403) redirect("/generate")
  if (!data) notFound()
  return <GeneratorShell initial={data} />
}
