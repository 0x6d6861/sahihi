import { redirect } from "next/navigation"
import { filesHref, parseFilesView } from "@/lib/files-list"

/**
 * Templates are listed in All files (ADR 0038), so this list was dropped with its tab (ADR 0041).
 * Old links land on All files filtered to templates, keeping the folder and search.
 */
export default async function TemplatesPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const view = parseFilesView(await searchParams)
  redirect(filesHref({ ...view, type: "template" }))
}
