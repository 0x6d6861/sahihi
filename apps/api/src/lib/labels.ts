import { LABEL_COLOR_PRESETS, tagKey } from "@sahihi/core"
import { forOrganization, type Prisma, prisma } from "@sahihi/db"

/** Tags as the API returns them on a folder or document, alphabetical. */
export const TAG_SELECT = {
  select: { id: true, name: true },
  orderBy: { key: "asc" },
} as const satisfies Prisma.Document$tagsArgs

/**
 * The workspace's tags for `names` (already normalized and de-duplicated by `TagListSchema`),
 * creating the missing ones. An existing tag keeps its first spelling. Returns `{ id }` rows
 * ready for `tags: { set }`.
 */
export async function resolveTags(
  organizationId: string,
  names: readonly string[],
): Promise<{ id: string }[]> {
  if (names.length === 0) return []
  const rows = names.map((name) => ({ organizationId, name, key: tagKey(name) }))
  await prisma.tag.createMany({ data: rows, skipDuplicates: true })
  return prisma.tag.findMany({
    where: forOrganization(organizationId).tag({ key: { in: rows.map((r) => r.key) } }),
    select: { id: true },
  })
}

/**
 * Tags on at least one listed document or folder: the "Tag" filter options and the tag picker's
 * suggestions. Unused tags stay in the table but aren't offered.
 */
export function tagsInUse(organizationId: string) {
  const scope = forOrganization(organizationId)
  return prisma.tag.findMany({
    where: scope.tag({
      OR: [
        { documents: { some: scope.document({ status: { not: "UPLOADING" } }) } },
        { folders: { some: {} } },
      ],
    }),
    select: { id: true, name: true },
    orderBy: { key: "asc" },
  })
}

/** Where-clause for "tags include a tag named like `q`" (case-insensitive substring). */
export const tagMatches = (q: string) => ({ some: { key: { contains: tagKey(q) } } })

/** Where-clause for "has the tag named `name`" (case-insensitive, exact). */
export const hasTag = (name: string) => ({ some: { key: tagKey(name) } })

/**
 * Colours on at least one listed document or folder, for the Color filter: presets first in
 * picker order, then the rest by hex.
 */
export async function colorsInUse(organizationId: string): Promise<string[]> {
  const scope = forOrganization(organizationId)
  const [docs, folders] = await Promise.all([
    prisma.document.findMany({
      where: scope.document({ status: { not: "UPLOADING" }, color: { not: null } }),
      distinct: ["color"],
      select: { color: true },
    }),
    prisma.folder.findMany({
      where: scope.folder({ color: { not: null } }),
      distinct: ["color"],
      select: { color: true },
    }),
  ])
  const used = new Set([...docs, ...folders].flatMap((r) => (r.color ? [r.color] : [])))
  const presets: string[] = LABEL_COLOR_PRESETS.map((p) => p.color).filter((c) => used.has(c))
  const others = [...used].filter((c) => !presets.includes(c)).sort()
  return [...presets, ...others]
}
