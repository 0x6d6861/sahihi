"use client"

import { useState } from "react"
import { PlusIcon } from "@/components/app/icons"
import { Button } from "@/components/arc/button/button"
import { WebhookFormDialog } from "./webhook-form-dialog"

export function AddWebhookButton() {
  const [open, setOpen] = useState(false)
  return (
    <>
      <Button variant="secondary" onClick={() => setOpen(true)}>
        <PlusIcon aria-hidden />
        Add webhook
      </Button>
      <WebhookFormDialog open={open} onOpenChange={setOpen} />
    </>
  )
}
