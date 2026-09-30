"use client"

import { PlusIcon } from "lucide-react"
import { useState } from "react"
import { Button } from "@/components/ui/button"
import { WebhookFormDialog } from "./webhook-form-dialog"

export function AddWebhookButton() {
  const [open, setOpen] = useState(false)
  return (
    <>
      <Button onClick={() => setOpen(true)}>
        <PlusIcon aria-hidden />
        Add webhook
      </Button>
      <WebhookFormDialog open={open} onOpenChange={setOpen} />
    </>
  )
}
