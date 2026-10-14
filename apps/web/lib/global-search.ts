import type { SearchItem, SearchKind } from "@sahihi/core"
import { DOCUMENT_STATUS_BADGE, ENVELOPE_STATUS_BADGE } from "@/lib/constants"
import { APP_NAV, SETTINGS_NAV } from "@/lib/nav"

/**
 * Rows of the global search palette (ADR 0056), without icons so they stay testable. Pages and
 * actions are always listed; the workspace's items join once something is typed, so the empty
 * palette stays short and the list only grows when there's a query to narrow it.
 */
export interface SearchEntry {
  id: string
  label: string
  description?: string
  group: string
  keywords?: string[]
  href: string
  /** What the row stands for, to pick its icon. */
  icon: SearchKind | "page" | "settings" | "create" | "search"
}

const KIND_GROUP: Record<SearchKind, string> = {
  folder: "Folders",
  document: "Documents",
  envelope: "Envelopes",
  template: "Templates",
  draft: "Drafts",
}

export function searchItemHref(item: SearchItem): string {
  switch (item.kind) {
    case "folder":
      return `/files?folder=${encodeURIComponent(item.id)}`
    case "document":
      return `/documents/${item.id}`
    case "envelope":
      return `/envelopes/${item.id}`
    case "template":
      return `/templates/${item.id}/use`
    case "draft":
      return `/generate/${item.id}`
  }
}

function itemEntry(item: SearchItem): SearchEntry {
  return {
    id: `${item.kind}:${item.id}`,
    label: item.title,
    description:
      item.kind === "envelope"
        ? ENVELOPE_STATUS_BADGE[item.status].label
        : item.kind === "document"
          ? DOCUMENT_STATUS_BADGE[item.status].label
          : undefined,
    group: KIND_GROUP[item.kind],
    keywords: item.kind === "envelope" ? item.people : undefined,
    href: searchItemHref(item),
    icon: item.kind,
  }
}

const STATIC_ENTRIES: SearchEntry[] = [
  {
    id: "create:envelope",
    label: "New envelope",
    group: "Create",
    href: "/envelopes/new",
    icon: "create",
  },
  {
    id: "create:draft",
    label: "Draft with AI",
    group: "Create",
    href: "/generate",
    icon: "create",
  },
  ...APP_NAV.map((n) => ({
    id: `page:${n.href}`,
    label: n.label,
    group: "Go to",
    href: n.href,
    icon: "page" as const,
  })),
  ...SETTINGS_NAV.map((n) => ({
    id: `settings:${n.href}`,
    label: n.label,
    group: "Settings",
    // "settings" so a search for the word lists every settings page.
    keywords: ["settings"],
    href: n.href,
    icon: "settings" as const,
  })),
]

export function searchEntries(query: string, items: SearchItem[] | null): SearchEntry[] {
  const q = query.trim()
  if (!q) return STATIC_ENTRIES
  return [
    ...STATIC_ENTRIES,
    ...(items ?? []).map(itemEntry),
    {
      id: "search:files",
      label: `Search All files for “${q}”`,
      group: "All files",
      href: `/files?q=${encodeURIComponent(q.slice(0, 200))}`,
      icon: "search",
    },
  ]
}
