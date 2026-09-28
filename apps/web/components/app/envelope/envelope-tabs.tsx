"use client"

import { usePathname, useRouter, useSearchParams } from "next/navigation"
import { useCallback } from "react"
import { Tabs, TabsList, TabsPanel, TabsTab } from "@/components/ui/tabs"

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

/** Switches tabs through `?tab=` so a reload (or a "Fix" link) lands on the same one. */
export function useEnvelopeTab(defaultTab: EnvelopeTab) {
  const router = useRouter()
  const pathname = usePathname()
  const params = useSearchParams()
  const raw = params.get("tab")
  const tab = isTab(raw) ? raw : defaultTab
  const setTab = useCallback(
    (next: EnvelopeTab) => {
      const q = new URLSearchParams(params.toString())
      q.set("tab", next)
      router.replace(`${pathname}?${q.toString()}`, { scroll: false })
    },
    [params, pathname, router],
  )
  return [tab, setTab] as const
}

/**
 * Document / Recipients / Activity. While drafting, the editor panels stay mounted when hidden
 * (`keepMounted`), so switching tabs never drops a pending autosave or unsaved recipient edits.
 */
export function EnvelopeTabs({
  defaultTab,
  keepMounted,
  panels,
  counts,
}: {
  defaultTab: EnvelopeTab
  keepMounted: boolean
  panels: Record<EnvelopeTab, React.ReactNode>
  counts?: Partial<Record<EnvelopeTab, number>>
}) {
  const [tab, setTab] = useEnvelopeTab(defaultTab)
  return (
    <Tabs value={tab} onValueChange={(v) => isTab(v) && setTab(v)}>
      <TabsList>
        {ENVELOPE_TABS.map((t) => (
          <TabsTab key={t} value={t}>
            {LABELS[t]}
            {counts?.[t] !== undefined && (
              <span className="text-muted-foreground tabular-nums">{counts[t]}</span>
            )}
          </TabsTab>
        ))}
      </TabsList>
      {ENVELOPE_TABS.map((t) => (
        <TabsPanel key={t} value={t} keepMounted={keepMounted} className="pt-4">
          {panels[t]}
        </TabsPanel>
      ))}
    </Tabs>
  )
}
