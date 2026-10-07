"use client"

import { UpdateTemplateSchema } from "@sahihi/core"
import { useRouter } from "next/navigation"
import { useState } from "react"
import { ConfirmDialog, DialogActions } from "@/components/app/confirm-dialog"
import { LayoutTemplateIcon, PencilIcon, SendIcon, Trash2Icon } from "@/components/app/icons"
import { toastManager } from "@/components/app/toast"
import { Button as ArcButton } from "@/components/arc/button/button"
import { Dialog, DialogContent } from "@/components/arc/dialog/dialog"
import { type DropdownItem, DropdownMenu } from "@/components/arc/dropdown-menu/dropdown-menu"
import { Input } from "@/components/arc/input/input"
import { api } from "@/lib/api"
import { type FormErrors, issuesToFormErrors } from "@/lib/envelope-form"

export interface TemplateRow {
  id: string
  name: string
  description: string | null
}

/** Bulk send for anyone; Rename and Delete when the API says `permissions.manage`. */
export function TemplateRowActions({
  template,
  canManage,
}: {
  template: TemplateRow
  canManage: boolean
}) {
  const router = useRouter()
  const [renaming, setRenaming] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [name, setName] = useState(template.name)
  const [description, setDescription] = useState(template.description ?? "")
  const [errors, setErrors] = useState<FormErrors>({})
  const [busy, setBusy] = useState(false)

  async function rename(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const parsed = UpdateTemplateSchema.safeParse({ name, description: description.trim() || null })
    if (!parsed.success) return setErrors(issuesToFormErrors(parsed.error.issues))
    setBusy(true)
    try {
      await api(`/templates/${template.id}`, { method: "PATCH", json: parsed.data })
      setRenaming(false)
      toastManager.add({ title: "Template updated", type: "success" })
      router.refresh()
    } catch (err) {
      toastManager.add({
        title: "Not updated",
        description: err instanceof Error ? err.message : undefined,
        type: "error",
      })
    } finally {
      setBusy(false)
    }
  }

  async function remove() {
    try {
      await api(`/templates/${template.id}`, { method: "DELETE" })
      toastManager.add({ title: `“${template.name}” deleted`, type: "success" })
      router.refresh()
    } catch (err) {
      toastManager.add({
        title: "Not deleted",
        description: err instanceof Error ? err.message : undefined,
        type: "error",
      })
      throw err
    }
  }

  return (
    <>
      <DropdownMenu
        label="Actions"
        items={[
          {
            label: "Use template",
            icon: <LayoutTemplateIcon />,
            onSelect: () => router.push(`/templates/${template.id}/use`),
          },
          {
            label: "Bulk send",
            icon: <SendIcon />,
            onSelect: () => router.push(`/templates/${template.id}/bulk`),
          },
          ...(canManage
            ? ([
                {
                  label: "Rename",
                  icon: <PencilIcon />,
                  separatorBefore: true,
                  onSelect: () => {
                    setName(template.name)
                    setDescription(template.description ?? "")
                    setErrors({})
                    setRenaming(true)
                  },
                },
                {
                  label: "Delete",
                  icon: <Trash2Icon />,
                  destructive: true,
                  onSelect: () => setDeleting(true),
                },
              ] satisfies DropdownItem[])
            : []),
        ]}
      />

      <Dialog open={renaming} onOpenChange={(o) => !busy && setRenaming(o)}>
        <DialogContent title="Rename template">
          <form onSubmit={rename} noValidate className="flex flex-col gap-4">
            <Input
              label="Name"
              name="name"
              value={name}
              maxLength={120}
              error={errors.name}
              onChange={(e) => setName(e.target.value)}
            />
            <Input
              label="Description (optional)"
              name="description"
              value={description}
              maxLength={500}
              error={errors.description}
              onChange={(e) => setDescription(e.target.value)}
            />
            <DialogActions>
              <ArcButton
                variant="ghost"
                type="button"
                disabled={busy}
                onClick={() => setRenaming(false)}
              >
                Cancel
              </ArcButton>
              <ArcButton type="submit" loading={busy}>
                Save
              </ArcButton>
            </DialogActions>
          </form>
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={deleting}
        onOpenChange={setDeleting}
        title={`Delete “${template.name}”?`}
        description="Envelopes already created from it aren't affected. Its document stays in Documents."
        confirmLabel="Delete template"
        onConfirm={remove}
      />
    </>
  )
}
