import { Skeleton } from "@/components/arc/skeleton/skeleton"

/** Shown while an app page renders on the server (pages with their own loading.tsx override it). */
export default function AppLoading() {
  return (
    <div className="flex flex-col gap-8">
      <Skeleton label="Loading page" lines={1} className="max-w-48" />
      <section className="rounded-2xl border p-6">
        <Skeleton label="Loading content" lines={6} />
      </section>
    </div>
  )
}
