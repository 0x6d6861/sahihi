"use client"

import { useRouter } from "next/navigation"
import { type ReactNode, useEffect, useRef, useState, useTransition } from "react"
import { CheckIcon } from "@/components/app/icons"
import { Button } from "@/components/arc/button/button"
import { DropdownMenu } from "@/components/arc/dropdown-menu/dropdown-menu"
import { SearchField } from "@/components/arc/search-field/search-field"
import SegmentedControl from "@/components/arc/segmented-control/segmented-control"
import { type ListLayout, type ListPage, listLayoutCookie } from "@/lib/list-layout"

const SEARCH_DELAY_MS = 300

function saveLayout(page: ListPage, layout: ListLayout) {
  // biome-ignore lint/suspicious/noDocumentCookie: a plain preference cookie, read by the page
  document.cookie = listLayoutCookie(page, layout)
}

/**
 * URL navigation for a list page's search section: `go(href)` replaces the URL in a transition
 * (the Server Component re-renders), `setLayout` saves the choice and reloads without `?layout`.
 * A link that names a layout (`?layout=grid`) is saved too.
 */
export function useListNavigation(page: ListPage, urlLayout: ListLayout | undefined) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  useEffect(() => {
    if (urlLayout) saveLayout(page, urlLayout)
  }, [page, urlLayout])
  const go = (href: string) => startTransition(() => router.replace(href, { scroll: false }))
  return {
    pending,
    go,
    /** Saved in a cookie, so the URL stays clean and the next visit opens the same way. */
    setLayout: (layout: ListLayout, hrefWithoutLayout: string) => {
      saveLayout(page, layout)
      go(hrefWithoutLayout)
    },
  }
}

export type ChipOption = { value: string; label: string; icon?: ReactNode }

export interface SearchChip {
  id: string
  /** The chip's name at rest ("Status"); the chosen option's label replaces it once set. */
  label: string
  /** The first item, which clears the chip ("Any status"). */
  any: string
  options: ChipOption[]
  /** The value in the URL, if any. */
  current?: string
  /** Tags match without case; everything else exactly. */
  caseInsensitive?: boolean
}

/** Menu items are keyed by label, so two options with the same label get a suffix. */
export function uniqueLabels(options: ChipOption[]): ChipOption[] {
  const seen = new Map<string, number>()
  return options.map((o) => {
    const n = (seen.get(o.label) ?? 0) + 1
    seen.set(o.label, n)
    return n === 1 ? o : { ...o, label: `${o.label} (${n})` }
  })
}

const selectedOption = (chip: SearchChip) =>
  chip.current === undefined
    ? undefined
    : chip.options.find((o) =>
        chip.caseInsensitive
          ? o.value.toLowerCase() === chip.current?.toLowerCase()
          : o.value === chip.current,
      )

/**
 * The search section of the Documents, Envelopes and Templates pages, in the manner of Google
 * Drive (ADR 0035, 0036): a wide filled search bar, then one row of filter chips (each an Arc
 * `DropdownMenu` that shows its value and fills once set; the first item clears it), "Clear
 * filters" once any is set, and the List / Grid switch at the end. The page owns the URL: it gets
 * the typed query (debounced), chip changes and layout changes through callbacks.
 */
export function ListSearch({
  label,
  placeholder,
  query,
  onQueryChange,
  chips,
  onChipChange,
  onClearChips,
  layout,
  onLayoutChange,
  pending = false,
}: {
  label: string
  placeholder: string
  /** The query in the URL. */
  query: string
  onQueryChange: (q: string | undefined) => void
  chips: SearchChip[]
  onChipChange: (id: string, value: string | undefined) => void
  onClearChips: () => void
  layout: ListLayout
  onLayoutChange: (layout: ListLayout) => void
  pending?: boolean
}) {
  const [q, setQ] = useState(query)
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined)
  // Back/forward or a link changes the URL under us.
  useEffect(() => setQ(query), [query])
  useEffect(() => () => clearTimeout(timer.current), [])

  function onSearch(value: string) {
    setQ(value)
    clearTimeout(timer.current)
    timer.current = setTimeout(() => onQueryChange(value.trim() || undefined), SEARCH_DELAY_MS)
  }

  const filtered = chips.some((chip) => chip.current !== undefined)

  return (
    <search aria-label={label} className="flex flex-col gap-3" aria-busy={pending}>
      <div className="max-w-3xl">
        <SearchField
          appearance="filled"
          label={label}
          value={q}
          placeholder={placeholder}
          onValueChange={onSearch}
        />
      </div>
      <div className="flex items-center gap-3">
        {/* One row that scrolls sideways on narrow screens, like Drive's chips; the page never does. */}
        <div className="-mx-1 -my-1 flex min-w-0 flex-1 items-center gap-2 overflow-x-auto px-1 py-1 [scrollbar-width:none]">
          {chips.map((chip) => {
            const value = selectedOption(chip)
            const set = chip.current !== undefined
            return (
              <div key={chip.id} className="shrink-0">
                <DropdownMenu
                  label={value?.label ?? chip.current ?? chip.label}
                  accessibleLabel={`${chip.label}: ${value?.label ?? chip.current ?? chip.any}`}
                  active={set}
                  icon={set ? <CheckIcon /> : undefined}
                  align="start"
                  items={[
                    {
                      label: chip.any,
                      // An empty slot keeps every label in line with the checked one.
                      icon: set ? <span /> : <CheckIcon />,
                      onSelect: () => onChipChange(chip.id, undefined),
                    },
                    ...chip.options.map((o, i) => ({
                      label: o.label,
                      icon: value?.value === o.value ? <CheckIcon /> : (o.icon ?? <span />),
                      separatorBefore: i === 0,
                      onSelect: () => onChipChange(chip.id, o.value),
                    })),
                  ]}
                />
              </div>
            )
          })}
          {filtered && (
            <Button variant="ghost" size="sm" className="shrink-0" onClick={onClearChips}>
              Clear filters
            </Button>
          )}
        </div>
        <div className="shrink-0">
          <SegmentedControl
            label="Show as"
            value={layout}
            options={[
              { value: "list", label: "List" },
              { value: "grid", label: "Grid" },
            ]}
            onValueChange={(v) => onLayoutChange(v === "grid" ? "grid" : "list")}
          />
        </div>
      </div>
    </search>
  )
}
