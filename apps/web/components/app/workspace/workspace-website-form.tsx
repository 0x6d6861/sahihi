"use client"

import { useRouter } from "next/navigation"
import { useState } from "react"
import { Button } from "@/components/app/button"
import { Input } from "@/components/app/fields"
import { toastManager } from "@/components/app/toast"
import { api } from "@/lib/api"

/**
 * The workspace's website (PUT /api/workspace/website, owners and admins). Saving it makes the API
 * fetch the site's logo from logo.dev, which marks the active workspace in the switcher.
 */
export function WorkspaceWebsiteForm({
  website,
  icon,
  iconsAvailable,
}: {
  website: string | null
  /** Same-origin path of the stored icon, or null. */
  icon: string | null
  /** The server has a logo.dev key. */
  iconsAvailable: boolean
}) {
  const router = useRouter()
  const [value, setValue] = useState(website ?? "")
  const [error, setError] = useState<string | null>(null)
  const [pending, setPending] = useState(false)
  const [refreshing, setRefreshing] = useState(false)

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setError(null)
    setPending(true)
    try {
      const saved = await api<{ website: string | null; icon: string | null }>(
        "/workspace/website",
        { method: "PUT", json: { website: value.trim() || null } },
      )
      setValue(saved.website ?? "")
      toastManager.add({
        title: saved.website ? "Website saved" : "Website removed",
        description:
          saved.website && iconsAvailable && !saved.icon
            ? "No logo found for it. The switcher shows initials."
            : undefined,
        type: "success",
      })
      router.refresh()
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save the website")
    } finally {
      setPending(false)
    }
  }

  async function onRefresh() {
    setError(null)
    setRefreshing(true)
    try {
      const { icon: fresh } = await api<{ icon: string | null }>("/workspace/icon/refresh", {
        method: "POST",
      })
      toastManager.add({
        title: fresh ? "Icon updated" : "No logo found for this website",
        type: fresh ? "success" : "info",
      })
      router.refresh()
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not fetch the icon")
    } finally {
      setRefreshing(false)
    }
  }

  return (
    <form className="flex flex-col gap-4" onSubmit={onSubmit}>
      <div className="sm:max-w-sm">
        <Input
          label="Website"
          value={value}
          maxLength={200}
          inputMode="url"
          placeholder="acme.co.tz"
          error={error ?? undefined}
          onChange={(e) => setValue(e.target.value)}
        />
      </div>
      {icon && (
        <div className="flex items-center gap-2 text-muted-foreground text-sm">
          {/* biome-ignore lint/performance/noImgElement: same-origin icon route, fixed size */}
          <img
            src={icon}
            alt=""
            className="on-paper size-5.5 rounded-md border bg-background object-contain p-0.5"
          />
          Shown in the workspace switcher while this workspace is active.
        </div>
      )}
      <div className="flex flex-wrap gap-2">
        <Button
          type="submit"
          variant="secondary"
          loading={pending}
          disabled={value.trim() === (website ?? "")}
        >
          Save
        </Button>
        {iconsAvailable && website && value.trim() === website && (
          <Button type="button" variant="ghost" loading={refreshing} onClick={onRefresh}>
            {icon ? "Fetch icon again" : "Fetch icon"}
          </Button>
        )}
      </div>
    </form>
  )
}
