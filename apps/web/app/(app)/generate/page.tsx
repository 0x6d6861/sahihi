import { STARTERS } from "@sahihi/core"
import Link from "next/link"
import { DraftRowActions } from "@/components/app/generator/draft-row-actions"
import { ImportButton } from "@/components/app/generator/import-dialog"
import {
  DeleteTemplate,
  EnableAssistant,
  StartBlankButton,
  StartCard,
  StartGroup,
} from "@/components/app/generator/start-actions"
import { FileTextIcon, SparklesIcon } from "@/components/app/icons"
import { Panel } from "@/components/app/panel"
import { Person } from "@/components/app/people"
import { DraftStatusIcon } from "@/components/app/status-icon"
import { TemplateTypeIcon } from "@/components/app/type-icons"
import { EmptyState } from "@/components/arc/empty-state/empty-state"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { apiServer } from "@/lib/api-server"
import { formatDate, formatDateTime } from "@/lib/format"
import type { GenerationTemplateItem } from "@/lib/generator"

interface Settings {
  configured: boolean
  enabled: boolean
  canUse: boolean
  canManage: boolean
}
interface DraftItem {
  id: string
  title: string
  status: "DRAFT" | "FINALIZED"
  envelopeId: string | null
  updatedAt: string
  canEdit: boolean
  createdBy: { name: string; image: string | null }
}

/**
 * AI drafts (docs/ai-documents.md): carry on with a draft, or start one blank, from an imported
 * file, a starter or a workspace template. When the assistant is off, owners and admins can turn it on here.
 */
export default async function GeneratePage() {
  const { data: settings } = await apiServer<Settings>("/generated-documents/settings")
  if (!settings?.configured) {
    return (
      <EmptyState
        icon={<SparklesIcon aria-hidden />}
        title="The AI assistant isn't set up"
        description="This Sahihi server has no AI model configured. Ask your administrator to set AI_MODEL."
      />
    )
  }
  if (!settings.enabled || !settings.canUse) {
    return (
      <EmptyState
        icon={<SparklesIcon aria-hidden />}
        title="Draft documents with AI"
        description={
          settings.canManage
            ? "The assistant drafts from reviewed starters and asks before filling anything in. Document text is sent to the AI provider, so it's off until you turn it on for this workspace."
            : "The assistant is off for this workspace. Ask an owner or admin to turn it on."
        }
        action={settings.canManage ? <EnableAssistant /> : undefined}
      />
    )
  }

  const [{ data }, { data: templateData }] = await Promise.all([
    apiServer<{ items: DraftItem[] }>("/generated-documents"),
    apiServer<{ items: GenerationTemplateItem[] }>("/generated-documents/templates"),
  ])
  const drafts = data?.items ?? []
  const templates = templateData?.items ?? []
  return (
    <StartGroup>
      <div className="flex flex-col gap-10">
        <header className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <h1 className="font-medium text-2xl tracking-tight">Drafting</h1>
          <div className="flex flex-wrap items-center gap-2">
            <ImportButton />
            <StartBlankButton />
          </div>
        </header>

        {/* Coming back is mostly to carry on, so drafts come first. */}
        {drafts.length > 0 && (
          <section aria-labelledby="drafts-heading" className="flex flex-col gap-4">
            <h2 id="drafts-heading" className="font-medium text-base">
              Your drafts
            </h2>
            {/* The table of All files in list view, without selection. */}
            <Panel className="gap-0 p-2 sm:p-3">
              <Table>
                <TableHeader>
                  <TableRow className="hover:bg-transparent">
                    <TableHead className="ps-3">Name</TableHead>
                    <TableHead className="max-md:hidden">Owner</TableHead>
                    <TableHead className="max-md:hidden">Edited</TableHead>
                    <TableHead className="w-0">
                      <span className="sr-only">Actions</span>
                    </TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {drafts.map((d) => (
                    <TableRow key={d.id}>
                      {/* w-full + max-w-0: the name takes the spare width and truncates. */}
                      <TableCell className="w-full max-w-0 ps-3">
                        <div className="flex min-w-0 items-center gap-3">
                          <SparklesIcon
                            aria-hidden
                            className="size-5 shrink-0 text-muted-foreground"
                          />
                          <Link
                            href={`/generate/${d.id}`}
                            title={d.title}
                            className="truncate font-medium underline-offset-4 hover:underline"
                          >
                            {d.title}
                          </Link>
                          <DraftStatusIcon status={d.status} />
                        </div>
                      </TableCell>
                      <TableCell className="max-w-44 whitespace-nowrap text-muted-foreground max-md:hidden">
                        <Person person={d.createdBy} />
                      </TableCell>
                      <TableCell className="whitespace-nowrap text-muted-foreground tabular-nums max-md:hidden">
                        <time dateTime={d.updatedAt} title={formatDateTime(d.updatedAt)}>
                          {formatDate(d.updatedAt)}
                        </time>
                      </TableCell>
                      <TableCell className="pe-1">
                        <DraftRowActions draft={d} />
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </Panel>
          </section>
        )}

        <StartSection title="Starters">
          {STARTERS.map((s) => (
            <StartCard
              key={s.key}
              from={{ starter: s.key }}
              icon={<FileTextIcon aria-hidden className="size-5 shrink-0 text-muted-foreground" />}
              name={s.name}
              description={s.description}
            />
          ))}
        </StartSection>

        {templates.length > 0 && (
          <StartSection title="Workspace templates">
            {templates.map((t) => (
              <StartCard
                key={t.id}
                from={{ templateId: t.id }}
                icon={<TemplateTypeIcon />}
                name={t.name}
                description={t.description}
                meta={`Saved by ${t.createdBy.name}`}
                actions={t.canManage ? <DeleteTemplate id={t.id} name={t.name} /> : undefined}
              />
            ))}
          </StartSection>
        )}
      </div>
    </StartGroup>
  )
}

/** A titled grid of start tiles, unboxed like the card grids on All files. */
function StartSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="flex flex-col gap-4">
      <h2 className="font-medium text-base">{title}</h2>
      <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">{children}</ul>
    </section>
  )
}
