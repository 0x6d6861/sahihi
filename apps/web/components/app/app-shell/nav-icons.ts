import { AiMagicIcon, Folder01Icon, InboxIcon } from "@hugeicons/core-free-icons"
import type { IconSvgElement } from "@hugeicons/react"
import type { AppNavHref } from "@/lib/nav"

/** The top bar's section icons, shared by the nav pill and the search palette's "Go to" rows. */
export const NAV_ICONS: Record<AppNavHref, IconSvgElement> = {
  "/files": Folder01Icon,
  "/generate": AiMagicIcon,
  "/inbox": InboxIcon,
}
