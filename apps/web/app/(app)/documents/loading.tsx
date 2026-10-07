import { Skeleton } from "@/components/arc/skeleton/skeleton"

/** Shown while the documents list streams in. Mirrors the page: title and count, then the list. */
export default function DocumentsLoading() {
  return (
    <div className="flex flex-col gap-8">
      <Skeleton label="Loading documents" lines={2} className="max-w-56" />
      <section className="rounded-2xl border p-5">
        <Skeleton label="Loading documents" lines={6} />
      </section>
    </div>
  )
}
