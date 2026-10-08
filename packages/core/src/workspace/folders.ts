/**
 * Document folders and the Documents list filters (ADR 0022). Pure helpers; the API owns the
 * queries.
 */

/** Deepest nesting allowed (root folders are depth 1). Keeps breadcrumbs and ancestor walks short. */
export const MAX_FOLDER_DEPTH = 8

/** Documents list "Period" filter: created within the last N days, or since 1 January. */
export const DOCUMENT_PERIODS = ["7d", "30d", "90d", "year"] as const
export type DocumentPeriod = (typeof DOCUMENT_PERIODS)[number]

const DAY_MS = 24 * 60 * 60 * 1000

/** Earliest `createdAt` a document may have to match `period` (UTC). */
export function periodStart(period: DocumentPeriod, now: Date): Date {
  switch (period) {
    case "7d":
      return new Date(now.getTime() - 7 * DAY_MS)
    case "30d":
      return new Date(now.getTime() - 30 * DAY_MS)
    case "90d":
      return new Date(now.getTime() - 90 * DAY_MS)
    case "year":
      return new Date(Date.UTC(now.getUTCFullYear(), 0, 1))
  }
}

/**
 * Ancestors of `folderId`, root first, ending with the folder itself. `parentOf` maps every
 * folder id in the org to its parent (null at the root). Stops on unknown ids and cycles.
 */
export function folderPath(
  folderId: string,
  parentOf: ReadonlyMap<string, string | null>,
): string[] {
  const path: string[] = []
  const seen = new Set<string>()
  let current: string | null | undefined = folderId
  while (current && parentOf.has(current) && !seen.has(current)) {
    seen.add(current)
    path.unshift(current)
    current = parentOf.get(current)
  }
  return path
}

/** Levels below `folderId`, counting itself (a leaf is 1). */
export function subtreeHeight(
  folderId: string,
  parentOf: ReadonlyMap<string, string | null>,
): number {
  const children = new Map<string, string[]>()
  for (const [id, parent] of parentOf) {
    if (parent) children.set(parent, [...(children.get(parent) ?? []), id])
  }
  const height = (id: string, seen: Set<string>): number => {
    if (seen.has(id)) return 0
    seen.add(id)
    let max = 0
    for (const child of children.get(id) ?? []) max = Math.max(max, height(child, seen))
    return 1 + max
  }
  return height(folderId, new Set())
}

export type FolderMoveProblem = "cycle" | "too-deep"

/**
 * Can `folderId` (with everything under it) move under `newParentId` (null = root)? Refuses
 * moving a folder into itself or one of its descendants, and moves that nest deeper than
 * `MAX_FOLDER_DEPTH`. For a new folder, pass an id not in `parentOf`.
 */
export function checkFolderMove(
  folderId: string,
  newParentId: string | null,
  parentOf: ReadonlyMap<string, string | null>,
): FolderMoveProblem | null {
  const parentPath = newParentId ? folderPath(newParentId, parentOf) : []
  if (parentPath.includes(folderId)) return "cycle"
  const height = parentOf.has(folderId) ? subtreeHeight(folderId, parentOf) : 1
  if (parentPath.length + height > MAX_FOLDER_DEPTH) return "too-deep"
  return null
}

/**
 * Can every one of `folderIds` move under `newParentId` together? The first problem found, or
 * null. Moving a folder along with one of its subfolders is fine: the subfolder leaves it.
 */
export function checkFoldersMove(
  folderIds: readonly string[],
  newParentId: string | null,
  parentOf: ReadonlyMap<string, string | null>,
): FolderMoveProblem | null {
  for (const id of folderIds) {
    const problem = checkFolderMove(id, newParentId, parentOf)
    if (problem) return problem
  }
  return null
}

/**
 * Is something in `folderId` (null = root) already inside one of `moving`, at any depth? Such an
 * item travels with its folder: moving it separately would pull it out and flatten the tree, so
 * a move of "a folder and things in it" leaves those things where they are (ADR 0039).
 */
export function isInsideMovingFolder(
  folderId: string | null,
  moving: ReadonlySet<string>,
  parentOf: ReadonlyMap<string, string | null>,
): boolean {
  return folderId ? folderPath(folderId, parentOf).some((id) => moving.has(id)) : false
}
