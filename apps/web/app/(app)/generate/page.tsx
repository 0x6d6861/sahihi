import { STARTERS } from "@sahihi/core"
import Link from "next/link"
import {
  DeleteTemplate,
  EnableAssistant,
  StartDocument,
} from "@/components/app/generator/start-actions"
import { Panel } from "@/components/app/panel"
import { Badge } from "@/components/arc/badge/badge"
import { EmptyState } from "@/components/arc/empty-state/empty-state"
import { apiServer } from "@/lib/api-server"
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
  updatedAt: string
  createdBy: { name: string }
}

/**
 * AI drafts (docs/ai-documents.md): start a document from a starter with the assistant, or carry
 * on with one. When the assistant is off, owners and admins can turn it on here.
 */
export default async function GeneratePage() {
  const { data: settings } = await apiServer<Settings>("/generated-documents/settings")
  if (!settings?.configured) {
    return (
      <EmptyState
        title="The AI assistant isn't set up"
        description="This Sahihi server has no AI model configured. Ask your administrator to set AI_MODEL."
      />
    )
  }
  if (!settings.enabled || !settings.canUse) {
    return (
      <EmptyState
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
    <div className="flex flex-col gap-8">
      <header className="flex flex-col gap-2">
        <h1 className="font-medium text-2xl tracking-tight">Draft with AI</h1>
        <p className="text-muted-foreground text-sm">
          Pick a starter or one of your workspace's templates. The assistant asks for every detail
          it needs and never fills in what it doesn't know. Review the result before you send it.
        </p>
      </header>

      <Panel title="Start a document">
        <ul className="grid gap-3 sm:grid-cols-2">
          {STARTERS.map((s) => (
            <li key={s.key} className="flex flex-col gap-3 rounded-xl border p-4">
              <div className="flex flex-col gap-1">
                <span className="font-medium">{s.name}</span>
                <span className="text-muted-foreground text-sm">{s.description}</span>
              </div>
              <div>
                <StartDocument from={{ starter: s.key }} />
              </div>
            </li>
          ))}
        </ul>
      </Panel>

      {templates.length > 0 && (
        <Panel
          title="Workspace templates"
          description="Saved from documents drafted here, with their wording, blanks and signers."
        >
          <ul className="grid gap-3 sm:grid-cols-2">
            {templates.map((t) => (
              <li key={t.id} className="flex flex-col gap-3 rounded-xl border p-4">
                <div className="flex items-start justify-between gap-2">
                  <div className="flex min-w-0 flex-col gap-1">
                    <span className="truncate font-medium">{t.name}</span>
                    {t.description && (
                      <span className="text-muted-foreground text-sm">{t.description}</span>
                    )}
                    <span className="text-muted-foreground text-xs">
                      Saved by {t.createdBy.name}
                    </span>
                  </div>
                  {t.canManage && <DeleteTemplate id={t.id} name={t.name} />}
                </div>
                <div>
                  <StartDocument from={{ templateId: t.id }} />
                </div>
              </li>
            ))}
          </ul>
        </Panel>
      )}

      <Panel title="Your drafts">
        {drafts.length === 0 ? (
          <p className="text-muted-foreground text-sm">Nothing drafted yet.</p>
        ) : (
          <ul className="flex flex-col divide-y">
            {drafts.map((d) => (
              <li key={d.id} className="flex items-center justify-between gap-3 py-3">
                <Link href={`/generate/${d.id}`} className="min-w-0 truncate font-medium">
                  {d.title}
                </Link>
                <span className="flex shrink-0 items-center gap-3 text-muted-foreground text-sm">
                  <span className="max-sm:hidden">{d.createdBy.name}</span>
                  <Badge tone={d.status === "FINALIZED" ? "success" : "neutral"} size="sm">
                    {d.status === "FINALIZED" ? "Finalised" : "Draft"}
                  </Badge>
                </span>
              </li>
            ))}
          </ul>
        )}
      </Panel>
    </div>
  )
}
