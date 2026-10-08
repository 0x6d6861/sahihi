"use client"

import type { DocumentStatus, EnvelopeStage, EnvelopeStatus } from "@sahihi/core"
import type { ComponentType } from "react"
import {
  BanIcon,
  CircleAlertIcon,
  CircleCheckIcon,
  CircleXIcon,
  ClockAlertIcon,
  FilePenLineIcon,
  HourglassIcon,
  LoaderIcon,
  MailSendIcon,
} from "@/components/app/icons"
import { Tooltip } from "@/components/arc/tooltip/tooltip"
import { type BadgeTone, DOCUMENT_STATUS_BADGE, ENVELOPE_STATUS_BADGE } from "@/lib/constants"
import { cn } from "@/lib/utils"

type Glyph = ComponentType<{ className?: string; "aria-hidden"?: boolean }>

/** Same meaning as the badge tones: success = done, danger = failed, info = moving along… */
const TONE_CLASS: Record<BadgeTone, string> = {
  neutral: "text-muted-foreground",
  info: "text-info-foreground",
  success: "text-success-foreground",
  warning: "text-warning-foreground",
  danger: "text-destructive-foreground",
}

export const ENVELOPE_STATUS_ICON: Record<EnvelopeStatus, Glyph> = {
  DRAFT: FilePenLineIcon,
  SENT: MailSendIcon,
  IN_PROGRESS: HourglassIcon,
  COMPLETED: CircleCheckIcon,
  DECLINED: CircleXIcon,
  VOIDED: BanIcon,
  EXPIRED: ClockAlertIcon,
}

/** The Status chip's stages, drawn with the icon of their main status. */
export const ENVELOPE_STAGE_ICON: Record<EnvelopeStage, Glyph> = {
  drafts: FilePenLineIcon,
  active: HourglassIcon,
  completed: CircleCheckIcon,
  closed: BanIcon,
}

const DOCUMENT_STATUS_ICON: Record<DocumentStatus, Glyph> = {
  UPLOADING: LoaderIcon,
  READY: CircleCheckIcon,
  FAILED: CircleAlertIcon,
}

/**
 * A status as an icon instead of a text badge (ADR 0036): coloured by the badge tone, named for
 * assistive tech (`role="img"`), and spelled out in an Arc tooltip on hover. Not a tab stop: the
 * name is already read with the row.
 */
export function StatusIcon({
  icon: Icon,
  label,
  tone,
  className,
}: {
  icon: Glyph
  label: string
  tone: BadgeTone
  className?: string
}) {
  return (
    <Tooltip content={label}>
      <span role="img" aria-label={label} className={cn("inline-flex shrink-0", TONE_CLASS[tone])}>
        <Icon aria-hidden className={cn("size-4.5", className)} />
      </span>
    </Tooltip>
  )
}

export function EnvelopeStatusIcon({
  status,
  className,
}: {
  status: EnvelopeStatus
  className?: string
}) {
  const s = ENVELOPE_STATUS_BADGE[status]
  return (
    <StatusIcon
      icon={ENVELOPE_STATUS_ICON[status]}
      label={s.label}
      tone={s.tone}
      className={className}
    />
  )
}

export function DocumentStatusIcon({
  status,
  className,
}: {
  status: DocumentStatus
  className?: string
}) {
  const s = DOCUMENT_STATUS_BADGE[status]
  return (
    <StatusIcon
      icon={DOCUMENT_STATUS_ICON[status]}
      label={s.label}
      tone={s.tone}
      className={className}
    />
  )
}
