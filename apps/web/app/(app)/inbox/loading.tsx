import { Skeleton } from "@/components/arc/skeleton/skeleton"

/** Shown while the Inbox streams in. Mirrors the page: title, tabs, then the list. */
export default function InboxLoading() {
  return (
    <div className="flex flex-col gap-6">
      <Skeleton label="Loading inbox" lines={2} className="max-w-56" />
      <section className="rounded-2xl border p-5">
        <Skeleton label="Loading inbox" lines={6} />
      </section>
    </div>
  )
}
