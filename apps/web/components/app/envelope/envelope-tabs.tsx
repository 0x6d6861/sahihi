"use client"

import { useSearchParamState } from "@/components/app/use-search-param"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/arc/tabs/tabs"

export const ENVELOPE_TABS = ["document", "recipients", "activity"] as const
export type EnvelopeTab = (typeof ENVELOPE_TABS)[number]

const LABELS: Record<EnvelopeTab, string> = {
  document: "Document",
  recipients: "Recipients",
  activity: "Activity",
}

function isTab(v: string | null): v is EnvelopeTab {
  return ENVELOPE_TABS.includes(v as EnvelopeTab)
}

/** Switches tabs through `?tab=` so a reload lands on the same one. */
export function useEnvelopeTab(defaultTab: EnvelopeTab) {
  return useSearchParamState("tab", (raw) => (isTab(raw) ? raw : defaultTab))
}

/**
 * Document / Recipients / Activity, read-only. Drafts are edited in the draft editor
 * (`/envelopes/:id/edit`, ADR 0021) instead.
 */
export function EnvelopeTabs({
  defaultTab,
  panels,
  counts,
}: {
  defaultTab: EnvelopeTab
  panels: Record<EnvelopeTab, React.ReactNode>
  counts?: Partial<Record<EnvelopeTab, number>>
}) {
  const [tab, setTab] = useEnvelopeTab(defaultTab)
  return (
    <Tabs value={tab} onValueChange={(v) => isTab(v) && setTab(v)}>
      <TabsList aria-label="Envelope">
        {ENVELOPE_TABS.map((t) => (
          <TabsTrigger key={t} value={t}>
            {LABELS[t]}
            {counts?.[t] !== undefined && (
              <span className="ms-1.5 text-muted-foreground tabular-nums">{counts[t]}</span>
            )}
          </TabsTrigger>
        ))}
      </TabsList>
      {ENVELOPE_TABS.map((t) => (
        <TabsContent key={t} value={t} className="pt-4">
          {panels[t]}
        </TabsContent>
      ))}
    </Tabs>
  )
}
