import { z } from "zod"
import { ENVELOPE_STAGES, type EnvelopeStage } from "../envelope/stages"
import { DOCUMENT_LIST_STATUSES, LabelColorSchema, TagNameSchema } from "../shared/schemas"
import { DOCUMENT_PERIODS } from "./folders"

/**
 * All files (ADR 0038): documents, envelopes and templates in one list, newest first, with the
 * folders they share. Pure logic: the query, the Status chip's options and the merge of the three
 * typed lists into one page.
 */

export const FILE_KINDS = ["document", "envelope", "template"] as const
export type FileKind = (typeof FILE_KINDS)[number]

/**
 * The Status chip's options, grouped by type: envelope stages, then document states. Templates
 * have no status. Picking one also narrows the list to that type.
 */
export const FILE_STATUSES = [
  ...ENVELOPE_STAGES.map((s) => `envelope:${s}` as const),
  ...DOCUMENT_LIST_STATUSES.map((s) => `document:${s}` as const),
] as const
export type FileStatus = (typeof FILE_STATUSES)[number]

export type ParsedFileStatus =
  | { kind: "envelope"; stage: EnvelopeStage }
  | { kind: "document"; status: (typeof DOCUMENT_LIST_STATUSES)[number] }

export function parseFileStatus(status: FileStatus): ParsedFileStatus {
  const [kind, value] = status.split(":") as [string, string]
  return kind === "envelope"
    ? { kind, stage: value as EnvelopeStage }
    : { kind: "document", status: value as (typeof DOCUMENT_LIST_STATUSES)[number] }
}

/** Rows per page, and the last page (each type is read up to `page × size` rows to merge them). */
export const FILES_PAGE_SIZE = 25
export const MAX_FILES_PAGE = 40

/**
 * `GET /files?…`: like the Documents list (ADR 0022, 0025): `folderId` omitted = workspace root;
 * `q`, `tag` and `color` search every folder. `type` and `status` narrow to one type; `ownerId` is
 * who added it (uploader, sender or saver).
 */
export const ListFilesQuerySchema = z.object({
  page: z.coerce.number().int().min(1).max(MAX_FILES_PAGE).default(1),
  folderId: z.string().min(1).max(64).optional(),
  q: z.string().trim().max(200).optional(),
  type: z.enum(FILE_KINDS).optional(),
  status: z.enum(FILE_STATUSES).optional(),
  ownerId: z.string().min(1).max(64).optional(),
  period: z.enum(DOCUMENT_PERIODS).optional(),
  tag: TagNameSchema.optional(),
  color: LabelColorSchema.optional(),
})
export type ListFilesQuery = z.infer<typeof ListFilesQuerySchema>

/**
 * Which types the query can return: a status implies its type, and a type and a status of
 * another type match nothing.
 */
export function fileKindsFor(query: { type?: FileKind; status?: FileStatus }): FileKind[] {
  const implied = query.status ? parseFileStatus(query.status).kind : undefined
  if (query.type && implied && query.type !== implied) return []
  const only = query.type ?? implied
  return only ? [only] : [...FILE_KINDS]
}

/**
 * One page of the merged list: newest first, ties broken by id (descending, like the type lists).
 * Each list must hold its type's first `page × pageSize` rows, newest first.
 */
export function mergeNewestFirst<T extends { createdAt: Date | string; id: string }>(
  lists: readonly (readonly T[])[],
  page: number,
  pageSize: number,
): T[] {
  const time = (x: T) => new Date(x.createdAt).getTime()
  return lists
    .flat()
    .sort((a, b) => time(b) - time(a) || (a.id < b.id ? 1 : a.id > b.id ? -1 : 0))
    .slice((page - 1) * pageSize, page * pageSize)
}
