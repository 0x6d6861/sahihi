"use client"

import Link from "next/link"
import { useState } from "react"
import {
  ActivityList,
  type AuditEventRow,
  type ChainVerification,
} from "@/components/app/envelope/activity-list"
import {
  ActivityIcon,
  ArrowLeftIcon,
  DownloadIcon,
  EyeIcon,
  FilePenLineIcon,
  FileTextIcon,
  MousePointer2Icon,
  SendIcon,
  UsersIcon,
} from "@/components/app/icons"
import { SaveTemplateDialog } from "@/components/app/templates/save-template-dialog"
import { Badge } from "@/components/arc/badge/badge"
import { Drawer, DrawerContent } from "@/components/arc/drawer/drawer"
import { Progress } from "@/components/arc/progress/progress"
import {
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarSeparator,
} from "@/components/ui/sidebar"
import type { EnvelopeDetail } from "@/lib/envelope-detail"
import {
  EDITOR_STEP_INFO,
  EDITOR_STEPS,
  type EditorStep,
  stepEnabled,
  stepNumber,
  stepProgress,
} from "@/lib/envelope-editor"
import { useSendCheck } from "./send-context"

const STEP_ICONS: Record<EditorStep, React.ComponentType<{ "aria-hidden"?: boolean }>> = {
  document: FilePenLineIcon,
  recipients: UsersIcon,
  fields: MousePointer2Icon,
  preview: EyeIcon,
}

/**
 * The draft editor's left rail (a column beside the editor, or the phone drawer's content): where you are (step n/4 + progress), the steps, quick actions
 * (send, save as template, the original PDF, the activity log) and the way back.
 */
export function StepRail({
  envelope: e,
  fileUrl,
  audit,
  step,
  onStepChange,
  onNavigate,
  hasFieldOwners,
}: {
  envelope: EnvelopeDetail
  fileUrl: string | null
  audit: { events: AuditEventRow[]; verification: ChainVerification } | null
  step: EditorStep
  onStepChange: (step: EditorStep) => void
  /** Called after a step is picked, so the phone drawer can close. */
  onNavigate?: () => void
  hasFieldOwners: boolean
}) {
  const send = useSendCheck()
  const recipientNames = Object.fromEntries(e.recipients.map((r) => [r.id, r.name]))
  const [activityOpen, setActivityOpen] = useState(false)

  return (
    <>
      <SidebarHeader className="gap-3 p-4">
        <div className="flex items-center justify-between gap-2">
          <span className="font-medium text-sm">Document editor</span>
          <Badge size="sm">
            Step {stepNumber(step)}/{EDITOR_STEPS.length}
          </Badge>
        </div>
        <Progress value={stepProgress(step)} />
      </SidebarHeader>

      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel>Steps</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu className="gap-1">
              {EDITOR_STEPS.map((s) => {
                const Icon = STEP_ICONS[s]
                const info = EDITOR_STEP_INFO[s]
                return (
                  <SidebarMenuItem key={s}>
                    <SidebarMenuButton
                      size="lg"
                      className="h-auto items-start py-2"
                      isActive={s === step}
                      aria-current={s === step ? "step" : undefined}
                      disabled={!stepEnabled(s, hasFieldOwners)}
                      onClick={() => {
                        onStepChange(s)
                        onNavigate?.()
                      }}
                    >
                      <Icon aria-hidden />
                      <span className="flex min-w-0 flex-col gap-0.5">
                        <span>{info.title}</span>
                        <span className="whitespace-normal font-normal text-muted-foreground text-xs">
                          {info.description}
                        </span>
                      </span>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                )
              })}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        <SidebarSeparator />

        <SidebarGroup>
          <SidebarGroupLabel>Quick actions</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              <SidebarMenuItem>
                <SidebarMenuButton disabled={send.busy} onClick={() => void send.check()}>
                  <SendIcon aria-hidden />
                  <span>Send envelope</span>
                </SidebarMenuButton>
              </SidebarMenuItem>
              {e.recipients.length > 0 && (
                <SidebarMenuItem>
                  <SaveTemplateDialog
                    envelopeId={e.id}
                    envelopeTitle={e.title}
                    recipients={e.recipients}
                    trigger={<SidebarMenuButton />}
                  />
                </SidebarMenuItem>
              )}
              {fileUrl && (
                <SidebarMenuItem>
                  <SidebarMenuButton render={<a href={fileUrl} download={e.document.name} />}>
                    <DownloadIcon aria-hidden />
                    <span>Download original</span>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              )}
              <SidebarMenuItem>
                <SidebarMenuButton render={<Link href={`/documents/${e.document.id}`} />}>
                  <FileTextIcon aria-hidden />
                  <span>Open document</span>
                </SidebarMenuButton>
              </SidebarMenuItem>
              {audit && (
                <SidebarMenuItem>
                  <SidebarMenuButton onClick={() => setActivityOpen(true)}>
                    <ActivityIcon aria-hidden />
                    <span>Activity</span>
                  </SidebarMenuButton>
                  <Drawer open={activityOpen} onOpenChange={setActivityOpen}>
                    <DrawerContent
                      side="right"
                      title="Activity"
                      description="The audit trail of this envelope."
                    >
                      {/* Rendered only while open, in the browser, so `now` can't mismatch. */}
                      <ActivityList
                        events={audit.events}
                        verification={audit.verification}
                        recipientNames={recipientNames}
                        now={Date.now()}
                      />
                    </DrawerContent>
                  </Drawer>
                </SidebarMenuItem>
              )}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>

      <SidebarFooter>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton render={<Link href="/envelopes" />}>
              <ArrowLeftIcon aria-hidden />
              <span>Back to envelopes</span>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarFooter>
    </>
  )
}
