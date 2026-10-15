"use client"

import { useState } from "react"
import { Button } from "@/components/app/button"
import { PlusIcon } from "@/components/app/icons"
import { type AwsRoleSetup, ConnectionFormDialog } from "./connection-form-dialog"

export function AddConnectionButton({
  purpose,
  awsRole,
  label,
  variant = "secondary",
  disabled,
}: {
  purpose: "SYNC" | "PRIMARY"
  awsRole: AwsRoleSetup | null
  label: string
  variant?: "primary" | "secondary"
  disabled?: boolean
}) {
  const [open, setOpen] = useState(false)
  return (
    <>
      <Button variant={variant} disabled={disabled} onClick={() => setOpen(true)}>
        <PlusIcon aria-hidden />
        {label}
      </Button>
      <ConnectionFormDialog
        open={open}
        onOpenChange={setOpen}
        purpose={purpose}
        awsRole={awsRole}
      />
    </>
  )
}
