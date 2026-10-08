import Link from "next/link"
import type { ReactNode } from "react"
import { PdfIcon } from "@/components/app/icons"
import { FileThumbnail } from "@/components/extend/file-thumbnail"
import { cn } from "@/lib/utils"

/**
 * A tile in the Documents, Envelopes and Templates grids, in the manner of a Google Drive file
 * tile (ADR 0033, 0034, 0036): a tonal card with no border; a title row (type icon, title, ⋮
 * menu); the top of the document's first page in a 4:3 window (white paper in both themes, a PDF
 * mark until the worker has rendered it); and one quiet footer line. The whole card is a link; the
 * menu sits above it. Hover darkens the card's tone.
 */
export function ListCard({
  href,
  title,
  icon,
  menu,
  thumbnailUrl,
  footer,
  titleExtra,
  documentCount = 1,
}: {
  href: string
  title: string
  /** The type icon before the title. */
  icon: ReactNode
  /** The ⋮ menu (`compact` row actions). */
  menu: ReactNode
  thumbnailUrl: string | null
  footer: ReactNode
  /** Screen-reader-only extras for the link, such as a label colour's name. */
  titleExtra?: ReactNode
  /** Documents behind the thumbnail (ADR 0037); more than one shows a "3 documents" chip. */
  documentCount?: number
}) {
  return (
    <article
      className={cn(
        "press-subtle relative isolate flex min-w-0 flex-col rounded-2xl bg-muted px-1.5 pb-1.5",
        // Hover tone: a foreground tint under the content, so it works on the muted card in both themes.
        "before:-z-10 before:pointer-events-none before:absolute before:inset-0 before:rounded-2xl before:bg-foreground/0 before:transition-colors has-[a:hover]:before:bg-foreground/5",
        "has-[a:focus-visible]:ring-2 has-[a:focus-visible]:ring-ring",
      )}
    >
      <div className="flex h-11 min-w-0 items-center gap-2.5 ps-2 pe-0">
        {icon}
        <Link
          href={href}
          title={title}
          className="min-w-0 flex-1 truncate font-medium text-sm outline-none after:absolute after:inset-0 after:rounded-2xl"
        >
          {title}
          {titleExtra}
        </Link>
        {/* Above the card-wide link overlay, so the trigger stays clickable. */}
        <div className="relative z-10">{menu}</div>
      </div>

      {/* Paper stays white in both themes. The window shows the top of the page, like Drive. */}
      <div className="on-paper relative overflow-hidden rounded-xl">
        {documentCount > 1 && (
          <span className="absolute end-2 bottom-2 z-10 rounded-full border bg-background px-1.5 py-0.5 text-[11px] text-muted-foreground tabular-nums leading-none">
            {documentCount} documents
          </span>
        )}
        <FileThumbnail
          file={{ name: title, type: "application/pdf" }}
          previewImageUrl={thumbnailUrl}
          className="rounded-xl"
          previewAspectRatio={4 / 3}
          previewClassName="[&_img]:object-top"
          previewContent={
            thumbnailUrl ? undefined : (
              <span className="flex size-full items-center justify-center text-muted-foreground">
                <PdfIcon aria-hidden className="size-10" />
              </span>
            )
          }
        />
      </div>

      {/* Clicks fall through to the card's link; only the named icons (status tooltips, avatars)
          sit above it so they can be hovered. */}
      <div className="pointer-events-none relative z-10 flex h-9 min-w-0 items-center gap-2 px-2 pt-1.5 text-muted-foreground text-xs [&_[role=group]]:pointer-events-auto [&_[role=img]]:pointer-events-auto">
        {footer}
      </div>
    </article>
  )
}

/** The grid the cards sit in: auto-filling columns of at least 13rem, relaxed gaps. */
export function ListGrid({ children }: { children: ReactNode }) {
  return (
    <ul className="grid grid-cols-2 gap-x-4 gap-y-6 sm:grid-cols-[repeat(auto-fill,minmax(13rem,1fr))] sm:gap-x-6 sm:gap-y-8">
      {children}
    </ul>
  )
}
