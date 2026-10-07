import { RouteNotFound } from "@/components/app/route-states"

/** `notFound()` from an app page (unknown or other-workspace ids), inside the shell. */
export default function AppNotFound() {
  return <RouteNotFound homeHref="/documents" />
}
