"use client"

import { Avatar } from "@/components/arc/avatar/avatar"
import { AvatarGroup } from "@/components/arc/avatar-group/avatar-group"
import { cn } from "@/lib/utils"

export interface PersonRef {
  name: string
  /** Profile picture URL (`/api/avatars/…`); recipients have none, so they get initials. */
  image?: string | null
}

/** One person as an Arc avatar, with their name beside it unless `nameHidden` (ADR 0036). */
export function Person({
  person,
  nameHidden = false,
  className,
}: {
  person: PersonRef
  nameHidden?: boolean
  className?: string
}) {
  return (
    <span className={cn("inline-flex min-w-0 items-center gap-2", className)}>
      <Avatar name={person.name} src={person.image ?? undefined} size="sm" />
      {!nameHidden && <span className="truncate">{person.name}</span>}
    </span>
  )
}

/**
 * Several people as an Arc avatar group that collapses past `max` into "+N" (ADR 0036). The group
 * keys avatars by name, so repeated names get a suffix.
 */
export function People({
  people,
  label,
  max = 3,
}: {
  people: PersonRef[]
  /** Names the group for assistive tech ("Recipients"). */
  label: string
  max?: number
}) {
  const seen = new Map<string, number>()
  const members = people.map((p) => {
    const n = (seen.get(p.name) ?? 0) + 1
    seen.set(p.name, n)
    return { name: n === 1 ? p.name : `${p.name} (${n})`, src: p.image ?? undefined }
  })
  return <AvatarGroup members={members} max={max} size="sm" label={label} />
}
