"use client"

import { uniqueTags } from "@sahihi/core"
import { PlusIcon } from "@/components/app/icons"
import { Button } from "@/components/arc/button/button"
import { TagInput } from "@/components/arc/tag-input/tag-input"
import { tagSuggestions } from "@/lib/labels"

/** Most workspace tags offered under the field at once. */
const MAX_SUGGESTIONS = 8

/**
 * Tags for a folder or document (ADR 0025): Arc `TagInput` (Enter or comma adds, Backspace picks
 * and removes), plus the workspace's tags not chosen yet as one-click "add" buttons. Values are
 * normalized and de-duplicated case-insensitively on every change; the caller validates limits.
 */
export function TagField({
  value,
  onChange,
  suggestions,
  error,
}: {
  value: string[]
  onChange: (tags: string[]) => void
  /** Every tag in use in the workspace. */
  suggestions: readonly string[]
  error?: string
}) {
  const offered = tagSuggestions(suggestions, value, "").slice(0, MAX_SUGGESTIONS)

  return (
    <div className="flex flex-col gap-2">
      <TagInput
        label="Tags"
        value={value}
        onValueChange={(next) => onChange(uniqueTags(next))}
        description={error ? undefined : "Press Enter or comma to add. Search finds items by tag."}
      />
      {error && <p className="text-destructive-foreground text-sm">{error}</p>}
      {offered.length > 0 && (
        <ul aria-label="Tags in this workspace" className="flex flex-wrap gap-1.5">
          {offered.map((tag) => (
            <li key={tag}>
              <Button
                type="button"
                variant="secondary"
                size="sm"
                aria-label={`Add tag ${tag}`}
                onClick={() => onChange(uniqueTags([...value, tag]))}
              >
                <PlusIcon aria-hidden />
                {tag}
              </Button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
