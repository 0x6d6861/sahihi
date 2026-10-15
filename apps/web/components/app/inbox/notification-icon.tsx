import type { NotificationType } from "@sahihi/core"
import type { ComponentType } from "react"
import {
  BanIcon,
  CircleAlertIcon,
  CircleCheckIcon,
  CircleXIcon,
  ClockAlertIcon,
  DownloadIcon,
  EyeIcon,
  SendIcon,
  SignatureIcon,
  TriangleAlertIcon,
  UserPlusIcon,
} from "@/components/app/icons"
import { cn } from "@/lib/utils"

type Glyph = ComponentType<{ className?: string; "aria-hidden"?: boolean }>

/** Each notification type's mark in the Inbox; colour only where it means an outcome. */
const ICONS: Record<NotificationType, { icon: Glyph; className?: string }> = {
  "recipient.viewed": { icon: EyeIcon },
  "recipient.signed": { icon: SignatureIcon },
  "envelope.completed": { icon: CircleCheckIcon, className: "text-success-foreground" },
  "envelope.declined": { icon: CircleXIcon, className: "text-destructive-foreground" },
  "envelope.expired": { icon: ClockAlertIcon, className: "text-warning-foreground" },
  "envelope.voided": { icon: BanIcon },
  "bulk_send.finished": { icon: SendIcon },
  "export.ready": { icon: DownloadIcon },
  "export.failed": { icon: CircleAlertIcon, className: "text-destructive-foreground" },
  "member.joined": { icon: UserPlusIcon },
  "billing.quota_warning": { icon: TriangleAlertIcon, className: "text-warning-foreground" },
  "billing.quota_reached": { icon: CircleAlertIcon, className: "text-destructive-foreground" },
  "storage.failing": { icon: TriangleAlertIcon, className: "text-warning-foreground" },
}

export function NotificationIcon({ type }: { type: string }) {
  const entry = ICONS[type as NotificationType] ?? { icon: CircleAlertIcon }
  const Icon = entry.icon
  return <Icon aria-hidden className={cn("size-5 shrink-0", entry.className)} />
}
