"use client"

import {
  BULK_SEND_MAX_ROWS,
  type BulkRow,
  type BulkRowIssue,
  bulkColumns,
  bulkCsvTemplate,
  hasFixedContact,
  renderBulkTitle,
  rowsFromCsv,
  type TemplateForUse,
} from "@sahihi/core"
import { useRouter } from "next/navigation"
import { useState } from "react"
import { DownloadIcon, FileSpreadsheetIcon, SendIcon } from "@/components/app/icons"
import { Panel } from "@/components/app/panel"
import { toastManager } from "@/components/app/toast"
import { Alert } from "@/components/arc/alert/alert"
import { Button } from "@/components/arc/button/button"
import { Input } from "@/components/arc/input/input"
import { Textarea } from "@/components/arc/textarea/textarea"
import { FileUpload } from "@/components/extend/file-upload"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { ApiError, api } from "@/lib/api"

const CSV_ONLY = [{ label: "CSV", icon: FileSpreadsheetIcon }]

/**
 * Bulk send (docs/bulk-send.md): upload a CSV (one row per envelope), check it in the browser
 * with the same rules the server applies, then send. Nothing is sent while any row has a problem.
 */
export function BulkSendForm({
  templateId,
  templateName,
  template,
}: {
  templateId: string
  templateName: string
  template: TemplateForUse
}) {
  const router = useRouter()
  const firstOpen = template.roles.find((r) => !hasFixedContact(r))
  const [title, setTitle] = useState(
    firstOpen ? `${templateName}: {{${firstOpen.label} name}}` : templateName,
  )
  const [message, setMessage] = useState("")
  const [fileName, setFileName] = useState<string | null>(null)
  const [rows, setRows] = useState<BulkRow[]>([])
  const [issues, setIssues] = useState<BulkRowIssue[]>([])
  const [busy, setBusy] = useState(false)
  const columns = bulkColumns(template.roles)

  async function load(file: File) {
    const parsed = rowsFromCsv(template, await file.text())
    setFileName(file.name)
    setRows(parsed.rows)
    setIssues(parsed.issues)
  }

  function downloadTemplate() {
    const blob = new Blob([bulkCsvTemplate(template.roles)], { type: "text/csv;charset=utf-8" })
    const url = URL.createObjectURL(blob)
    const a = document.createElement("a")
    a.href = url
    a.download = `${templateName.replace(/[^\w -]+/g, "").trim() || "template"} bulk send.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  async function send() {
    setBusy(true)
    try {
      const { bulkSend } = await api<{ bulkSend: { id: string } }>(
        `/templates/${templateId}/bulk-sends`,
        { method: "POST", json: { title, message: message.trim() || undefined, rows } },
      )
      router.push(`/bulk-sends/${bulkSend.id}`)
    } catch (err) {
      setBusy(false)
      const body = err instanceof ApiError ? (err.body as { issues?: BulkRowIssue[] } | null) : null
      if (body?.issues?.length) setIssues(body.issues)
      toastManager.add({
        title: "Not sent",
        description: err instanceof Error ? err.message : undefined,
        type: "error",
      })
    }
  }

  const ready = rows.length > 0 && issues.length === 0 && title.trim().length > 0
  const blocker =
    rows.length === 0
      ? "Upload a CSV to continue."
      : issues.length > 0
        ? `Fix ${issues.length === 1 ? "the problem" : `the ${issues.length} problems`} in the CSV first.`
        : "Give the envelopes a title."
  // Row numbers match the CSV (row 1 = first line under the header).
  const preview = rows.slice(0, 5).map((r, i) => ({ ...r, row: i + 1 }))

  return (
    <div className="flex flex-col gap-6">
      <Panel title="1. Prepare a CSV">
        <p className="text-muted-foreground text-sm">
          One row per envelope, with these columns:{" "}
          {columns.map((c, i) => (
            <span key={c.header}>
              <span className="font-mono text-foreground">{c.header}</span>
              {i < columns.length - 1 ? ", " : ""}
            </span>
          ))}
          . Up to {BULK_SEND_MAX_ROWS} rows.
        </p>
        <div>
          <Button variant="secondary" onClick={downloadTemplate}>
            <DownloadIcon aria-hidden />
            Download CSV template
          </Button>
        </div>
      </Panel>

      <Panel title="2. Upload it">
        <FileUpload
          className="w-full"
          accept=".csv,text/csv"
          acceptedFileTypes={CSV_ONLY}
          multiple={false}
          showFileList={false}
          title={fileName ? `${fileName}: choose another file` : "Click to upload or drop a CSV"}
          description="Checked here before anything is sent"
          onFilesAccepted={(files) => {
            const file = files[0]
            if (file) void load(file)
          }}
        />
        {fileName && issues.length > 0 && (
          <Alert
            tone="danger"
            title={`${issues.length} problem${issues.length === 1 ? "" : "s"} to fix in ${fileName}`}
          >
            <ul className="flex flex-col gap-1">
              {issues.slice(0, 20).map((iss) => (
                <li key={`${iss.row}-${iss.message}`}>
                  {iss.row === 0 ? "" : `Row ${iss.row}: `}
                  {iss.message}
                </li>
              ))}
              {issues.length > 20 && <li>…and {issues.length - 20} more</li>}
            </ul>
          </Alert>
        )}
        {rows.length > 0 && issues.length === 0 && (
          <Alert
            tone="success"
            title={`${rows.length} envelope${rows.length === 1 ? "" : "s"} ready`}
          >
            Every row checks out.
          </Alert>
        )}
      </Panel>

      <Panel title="3. Check and send">
        <Input
          label="Envelope title"
          value={title}
          maxLength={200}
          description="Placeholders like {{Tenant name}} are filled per row."
          onChange={(e) => setTitle(e.target.value)}
        />
        <Textarea
          label="Message (optional)"
          value={message}
          rows={3}
          maxLength={2000}
          onChange={(e) => setMessage(e.target.value)}
        />
        {preview.length > 0 && (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Row</TableHead>
                <TableHead>Title</TableHead>
                <TableHead>Recipients</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {preview.map((r) => (
                <TableRow key={r.row}>
                  <TableCell className="text-muted-foreground">{r.row}</TableCell>
                  <TableCell>{renderBulkTitle(title, template, r)}</TableCell>
                  <TableCell className="text-muted-foreground text-xs">
                    {r.recipients.map((p) => `${p.name} <${p.email}>`).join(", ")}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
        {rows.length > preview.length && (
          <p className="text-muted-foreground text-xs">
            …and {rows.length - preview.length} more rows.
          </p>
        )}
        <div className="flex flex-col gap-3 border-t pt-5 sm:flex-row sm:items-center">
          <Button onClick={send} loading={busy} disabled={!ready}>
            <SendIcon aria-hidden />
            Send {rows.length > 0 ? rows.length : ""} envelope{rows.length === 1 ? "" : "s"}
          </Button>
          {/* A disabled button always says why. */}
          {!ready && <p className="text-muted-foreground text-sm">{blocker}</p>}
        </div>
      </Panel>
    </div>
  )
}
