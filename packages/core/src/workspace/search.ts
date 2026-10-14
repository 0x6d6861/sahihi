import type { DocumentStatus, EnvelopeStatus } from "../shared/enums"

/**
 * Global search (ADR 0056): the top bar's command palette loads a light index of the workspace
 * once it opens and filters it in the browser. Each kind is capped at the newest
 * `SEARCH_INDEX_LIMIT` rows so the payload stays small; older items are a search on All files away.
 */
export const SEARCH_KINDS = ["folder", "document", "envelope", "template", "draft"] as const
export type SearchKind = (typeof SEARCH_KINDS)[number]

export const SEARCH_INDEX_LIMIT = 100

export type SearchItem =
  | { kind: "folder"; id: string; title: string }
  | { kind: "document"; id: string; title: string; status: DocumentStatus }
  | {
      kind: "envelope"
      id: string
      title: string
      status: EnvelopeStatus
      /** Recipients' names and emails, so a search for a person finds their envelopes. */
      people: string[]
    }
  | { kind: "template"; id: string; title: string }
  | { kind: "draft"; id: string; title: string }

export interface SearchIndex {
  items: SearchItem[]
  /** True when some kind had more than `SEARCH_INDEX_LIMIT` rows. */
  truncated: boolean
}
