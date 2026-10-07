import { RouteNotFound } from "@/components/app/route-states"

/** `notFound()` from the draft editor (unknown or other-workspace ids), centred in the shell. */
export default function EditorNotFound() {
  return (
    <div className="flex flex-1 items-center justify-center p-4">
      <RouteNotFound homeHref="/envelopes" />
    </div>
  )
}
