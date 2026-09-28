import type { DocumentStatus } from "@sahihi/core"
import { FileTextIcon } from "lucide-react"
import Link from "next/link"
import { redirect } from "next/navigation"
import { FileThumbnail } from "@/components/extend/file-thumbnail"
import { Badge } from "@/components/ui/badge"
import { Card, CardDescription, CardHeader, CardPanel, CardTitle } from "@/components/ui/card"
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
import { totalPages } from "@/lib/pagination"
import { DocumentsPagination } from "./documents-pagination"
import { UploadDocument, UploadDropzone } from "./upload-document"

interface DocumentRow {
  id: string
  name: string
  status: DocumentStatus
  pageCount: number | null
  createdAt: string
  _count: { envelopes: number }
  source: { id: string; name: string } | null
}

export const metadata = { title: "Documents" }

interface DocumentsPageData {
  items: DocumentRow[]
  page: number
  pageSize: number
  total: number
}

export default async function DocumentsPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string | string[] }>
}) {
  const raw = (await searchParams).page
  const requested = typeof raw === "string" ? raw : "1"
  const { status, data } = await apiServer<DocumentsPageData>(
    `/documents?page=${encodeURIComponent(requested)}`,
  )
  if (status === 400) redirect("/documents")
  const items = data?.items ?? []
  const total = data?.total ?? 0
  const page = data?.page ?? 1
  const pageCount = totalPages(total, data?.pageSize ?? 1)
  // Past the last page (e.g. after deletes): go to the last page that has rows.
  if (items.length === 0 && total > 0) redirect(`/documents?page=${pageCount}`)

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between gap-4">
        <h1 className="font-semibold text-xl">Documents</h1>
        <UploadDocument />
      </div>
      <Card>
        <CardHeader>
          <CardTitle>Your documents</CardTitle>
          <CardDescription>
            Upload a PDF, then create an envelope to send it for signature.
          </CardDescription>
        </CardHeader>
        <CardPanel>
          {total === 0 ? (
            <Empty className="md:py-10">
              <EmptyHeader>
                <EmptyMedia variant="icon">
                  <FileTextIcon aria-hidden />
                </EmptyMedia>
                <EmptyTitle>No documents yet</EmptyTitle>
                <EmptyDescription>Upload your first PDF to send it for signature.</EmptyDescription>
              </EmptyHeader>
              <EmptyContent className="w-full max-w-md">
                <UploadDropzone />
              </EmptyContent>
            </Empty>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Pages</TableHead>
                  <TableHead>Envelopes</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Uploaded</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {items.map((d) => (
                  <TableRow key={d.id}>
                    <TableCell className="font-medium">
                      <Link
                        href={`/documents/${d.id}`}
                        className="flex items-center gap-3 hover:underline"
                      >
                        <FileThumbnail
                          file={{ name: d.name, type: "application/pdf" }}
                          className="size-10 shrink-0 rounded-lg"
                        />
                        <span className="flex min-w-0 flex-col">
                          <span className="truncate">{d.name}</span>
                          {d.source && (
                            <span className="truncate font-normal text-muted-foreground text-xs">
                              Prepared from {d.source.name}
                            </span>
                          )}
                        </span>
                      </Link>
                    </TableCell>
                    <TableCell>{d.pageCount ?? "—"}</TableCell>
                    <TableCell>{d._count.envelopes}</TableCell>
                    <TableCell>
                      <Badge variant={d.status === "READY" ? "success" : "error"}>
                        {d.status.toLowerCase()}
                      </Badge>
                    </TableCell>
                    <TableCell>{new Date(d.createdAt).toLocaleDateString()}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
          {pageCount > 1 && (
            <DocumentsPagination
              page={page}
              pageCount={pageCount}
              total={total}
              pageSize={data?.pageSize ?? items.length}
            />
          )}
        </CardPanel>
      </Card>
    </div>
  )
}
