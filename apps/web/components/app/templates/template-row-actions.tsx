"use client"

import { UpdateTemplateSchema } from "@sahihi/core"
import { EllipsisIcon, PencilIcon, Trash2Icon } from "lucide-react"
import { useRouter } from "next/navigation"
import { useState } from "react"
import {
  AlertDialog,
  AlertDialogClose,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogPopup,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogFooter,
  DialogHeader,
  DialogPanel,
  DialogPopup,
  DialogTitle,
} from "@/components/ui/dialog"
import { Field, FieldError, FieldLabel } from "@/components/ui/field"
import { Form } from "@/components/ui/form"
import { Input } from "@/components/ui/input"
import { Menu, MenuItem, MenuPopup, MenuTrigger } from "@/components/ui/menu"
import { Spinner } from "@/components/ui/spinner"
import { toastManager } from "@/components/ui/toast"
import { api } from "@/lib/api"
import { type FormErrors, issuesToFormErrors } from "@/lib/envelope-form"

export interface TemplateRow {
  id: string
  name: string
  description: string | null
}

/** Rename / delete, shown only when the API says `permissions.manage`. */
export function TemplateRowActions({ template }: { template: TemplateRow }) {
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
    setBusy(true)
    try {
      await api(`/templates/${template.id}`, { method: "DELETE" })
      setDeleting(false)
      toastManager.add({ title: `“${template.name}” deleted`, type: "success" })
      router.refresh()
    } catch (err) {
      toastManager.add({
        title: "Not deleted",
        description: err instanceof Error ? err.message : undefined,
        type: "error",
      })
    } finally {
      setBusy(false)
    }
  }

  return (
    <>
      <Menu>
        <MenuTrigger
          render={
            <Button
              variant="ghost"
              size="icon-sm"
              aria-label={`More actions for ${template.name}`}
            />
          }
        >
          <EllipsisIcon aria-hidden />
        </MenuTrigger>
        <MenuPopup align="end">
          <MenuItem
            onClick={() => {
              setName(template.name)
              setDescription(template.description ?? "")
              setErrors({})
              setRenaming(true)
            }}
          >
            <PencilIcon aria-hidden />
            Rename
          </MenuItem>
          <MenuItem variant="destructive" onClick={() => setDeleting(true)}>
            <Trash2Icon aria-hidden />
            Delete
          </MenuItem>
        </MenuPopup>
      </Menu>

      <Dialog open={renaming} onOpenChange={(o) => !busy && setRenaming(o)}>
        <DialogPopup>
          <DialogHeader>
            <DialogTitle>Rename template</DialogTitle>
          </DialogHeader>
          <Form errors={errors} onSubmit={rename} className="contents">
            <DialogPanel className="flex flex-col gap-4">
              <Field name="name">
                <FieldLabel>Name</FieldLabel>
                <Input value={name} maxLength={120} onChange={(e) => setName(e.target.value)} />
                <FieldError />
              </Field>
              <Field name="description">
                <FieldLabel>Description (optional)</FieldLabel>
                <Input
                  value={description}
                  maxLength={500}
                  onChange={(e) => setDescription(e.target.value)}
                />
                <FieldError />
              </Field>
            </DialogPanel>
            <DialogFooter>
              <Button
                variant="ghost"
                type="button"
                disabled={busy}
                onClick={() => setRenaming(false)}
              >
                Cancel
              </Button>
              <Button type="submit" disabled={busy}>
                {busy && <Spinner aria-hidden />}
                Save
              </Button>
            </DialogFooter>
          </Form>
        </DialogPopup>
      </Dialog>

      <AlertDialog open={deleting} onOpenChange={(o) => !busy && setDeleting(o)}>
        <AlertDialogPopup>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete “{template.name}”?</AlertDialogTitle>
            <AlertDialogDescription>
              Envelopes already created from it aren't affected. Its document stays in Documents.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogClose render={<Button variant="ghost" disabled={busy} />}>
              Cancel
            </AlertDialogClose>
            <Button variant="destructive" onClick={remove} disabled={busy}>
              {busy && <Spinner aria-hidden />}
              Delete template
            </Button>
          </AlertDialogFooter>
        </AlertDialogPopup>
      </AlertDialog>
    </>
  )
}
