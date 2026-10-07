import { RouteNotFound } from "@/components/app/route-states"

/** Unknown URLs, and `notFound()` outside the app shell. */
export default function NotFound() {
  return (
    <main className="flex min-h-dvh items-center justify-center p-4">
      <RouteNotFound homeHref="/" />
    </main>
  )
}
