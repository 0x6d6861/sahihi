"use client"

import type { VariableType } from "@sahihi/core"
import { type Editor, EditorContent, useEditor, useEditorState } from "@tiptap/react"
import { useCallback, useEffect, useRef, useState } from "react"
import { useAutosave } from "@/components/app/field-editor/use-autosave"
import {
  BoldIcon,
  BracesIcon,
  ItalicIcon,
  ListIcon,
  ListOrderedIcon,
  PlusIcon,
  RedoIcon,
  TableIcon,
  UnderlineIcon,
  UndoIcon,
} from "@/components/app/icons"
import { Alert } from "@/components/arc/alert/alert"
import { Button } from "@/components/arc/button/button"
import { Input } from "@/components/arc/input/input"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/arc/popover/popover"
import { Tooltip } from "@/components/arc/tooltip/tooltip"
import { Button as IconButton } from "@/components/ui/button"
import { Toggle } from "@/components/ui/toggle"
import { Toolbar, ToolbarButton, ToolbarGroup, ToolbarSeparator } from "@/components/ui/toolbar"
import { ApiError } from "@/lib/api"
import { blankKey, fromEditorDoc, toEditorDoc } from "@/lib/generator-editor"
import { cn } from "@/lib/utils"
import { useGenerator } from "../generator-context"
import { type DocMode, DocModeContext } from "./doc-mode"
import { editorExtensions } from "./extensions"

type NewBlank = { key: string; label: string; type: VariableType }

/**
 * The document on paper (docs/ai-documents.md → Web), in one editor with two modes. Preview is
 * read-only: clicking a section attaches it to the next chat message. Editing is the rich-text
 * editor, whose schema is the document model, so what's typed here is what renders and gets
 * signed. Saves are debounced and serialised (`useAutosave`); each save is a version. Edits apply
 * on top of answers given meanwhile (blanks and signers live outside the text); a 409 means the
 * text changed elsewhere, and the editor offers to reload.
 */
export function DocumentEditor({ mode }: { mode: DocMode }) {
  const { detail, editable: canEdit, saveContent, refresh } = useGenerator()
  const editable = canEdit && mode === "editing"
  const { data } = detail.version
  // The version whose text the editor holds: the base of the next save.
  const base = useRef(detail.version.id)
  const pendingBlanks = useRef<NewBlank[]>([])
  const [revision, setRevision] = useState(0)
  const [stale, setStale] = useState(false)
  const [invalid, setInvalid] = useState(false)
  const lastSaved = useRef(JSON.stringify(data.content))

  const editor = useEditor({
    extensions: editorExtensions,
    content: toEditorDoc(data.content),
    editable,
    immediatelyRender: false,
    // The CSP has no inline styles; the editor's few rules live in the classes below.
    injectCSS: false,
    onUpdate: () => setRevision((r) => r + 1),
  })

  const save = useCallback(async () => {
    if (!editor) return
    let content: ReturnType<typeof fromEditorDoc>
    try {
      content = fromEditorDoc(editor.getJSON() as Parameters<typeof fromEditorDoc>[0])
      setInvalid(false)
    } catch {
      setInvalid(true)
      throw new Error("invalid")
    }
    const newVariables = pendingBlanks.current
    // The editor reports updates that change nothing (e.g. normalising on load): no version.
    if (!newVariables.length && JSON.stringify(content) === lastSaved.current) return
    try {
      base.current = await saveContent({ baseVersionId: base.current, content, newVariables })
      lastSaved.current = JSON.stringify(content)
      pendingBlanks.current = pendingBlanks.current.filter((b) => !newVariables.includes(b))
    } catch (err) {
      if (err instanceof ApiError && err.status === 409) setStale(true)
      throw err
    }
  }, [editor, saveContent])

  const autosave = useAutosave(revision, save, 1200)

  // Keep the base current when other saves (answers, signers) add versions: they don't touch the
  // text, so the editor's text is still that of the latest version.
  useEffect(() => {
    if (JSON.stringify(data.content) === lastSaved.current) base.current = detail.version.id
  }, [data.content, detail.version.id])

  useEffect(() => {
    editor?.setEditable(editable)
  }, [editor, editable])

  const reload = async () => {
    await refresh()
    setStale(false)
  }
  // After a reload, show the server's text.
  useEffect(() => {
    if (!editor || stale) return
    const current = JSON.stringify(data.content)
    if (current !== lastSaved.current && autosave.status === "saved") {
      lastSaved.current = current
      base.current = detail.version.id
      // Outside React's commit: the node views render synchronously (flushSync) when content is set.
      queueMicrotask(() => {
        if (!editor.isDestroyed) {
          editor.commands.setContent(toEditorDoc(data.content), { emitUpdate: false })
        }
      })
    }
  }, [editor, stale, data.content, detail.version.id, autosave.status])

  return (
    <DocModeContext.Provider value={mode}>
      {editable && editor && (
        <EditorToolbar
          editor={editor}
          status={autosave.status}
          onRetry={() => void autosave.retry()}
          onNewBlank={(blank) => {
            pendingBlanks.current.push(blank)
            editor
              .chain()
              .focus()
              .insertContent({ type: "variable", attrs: { key: blank.key } })
              .run()
          }}
          takenKeys={[
            ...data.variables.map((v) => v.key),
            ...pendingBlanks.current.map((b) => b.key),
          ]}
        />
      )}
      <div className="mx-auto flex max-w-[720px] flex-col gap-4 px-6 py-10 sm:px-12">
        {stale && (
          <Alert tone="danger" title="The text changed somewhere else">
            Your last edit wasn't saved.{" "}
            <button type="button" className="underline underline-offset-4" onClick={reload}>
              Load the latest version
            </button>
          </Alert>
        )}
        {invalid && (
          <Alert tone="warning" title="This edit can't be saved">
            Something in the text isn't supported in a document. Undo the last change.
          </Alert>
        )}
        <article className="flex flex-col gap-6">
          <h2 className="font-semibold text-[1.75rem] leading-tight tracking-tight">
            {data.title}
          </h2>
          <EditorContent
            editor={editor}
            className={cn(
              "[counter-reset:section] [&_.ProseMirror]:flex [&_.ProseMirror]:flex-col [&_.ProseMirror]:gap-3 [&_.ProseMirror]:whitespace-pre-wrap [&_.ProseMirror]:text-base [&_.ProseMirror]:leading-7 [&_.ProseMirror]:outline-none [&_.selectedCell]:bg-muted [&_ol]:list-[lower-alpha] [&_ol]:pl-7 [&_table]:w-full [&_table]:table-fixed [&_table]:border-collapse [&_td]:border [&_td]:px-2 [&_td]:py-1.5 [&_td]:align-top [&_th]:border [&_th]:px-2 [&_th]:py-1.5 [&_th]:text-left [&_th]:align-top [&_th]:font-medium [&_ul]:list-disc [&_ul]:pl-7",
              editable && "[&_.ProseMirror]:min-h-[60vh]",
            )}
          />
        </article>
      </div>
    </DocModeContext.Provider>
  )
}

function EditorToolbar({
  editor,
  status,
  onRetry,
  onNewBlank,
  takenKeys,
}: {
  editor: Editor
  status: ReturnType<typeof useAutosave>["status"]
  onRetry: () => void
  onNewBlank: (blank: NewBlank) => void
  takenKeys: string[]
}) {
  const state = useEditorState({
    editor,
    selector: ({ editor: e }) => ({
      bold: e.isActive("bold"),
      italic: e.isActive("italic"),
      underline: e.isActive("underline"),
      bulletList: e.isActive("bulletList"),
      orderedList: e.isActive("orderedList"),
      inTable: e.isActive("table"),
      canUndo: e.can().undo(),
      canRedo: e.can().redo(),
    }),
  })
  const mark = (name: "bold" | "italic" | "underline", label: string, icon: React.ReactNode) => (
    <Tooltip content={label}>
      <ToolbarButton
        render={
          <Toggle
            size="sm"
            aria-label={label}
            pressed={state[name]}
            onPressedChange={() => editor.chain().focus().toggleMark(name).run()}
          />
        }
      >
        {icon}
      </ToolbarButton>
    </Tooltip>
  )
  const list = (name: "bulletList" | "orderedList", label: string, icon: React.ReactNode) => (
    <Tooltip content={label}>
      <ToolbarButton
        render={
          <Toggle
            size="sm"
            aria-label={label}
            pressed={state[name]}
            onPressedChange={() =>
              name === "bulletList"
                ? editor.chain().focus().toggleBulletList().run()
                : editor.chain().focus().toggleOrderedList().run()
            }
          />
        }
      >
        {icon}
      </ToolbarButton>
    </Tooltip>
  )

  return (
    <div className="sticky top-0 z-10 flex flex-wrap items-center justify-between gap-2 border-b bg-background px-5 py-2">
      <Toolbar aria-label="Formatting">
        <ToolbarGroup>
          {mark("bold", "Bold", <BoldIcon />)}
          {mark("italic", "Italic", <ItalicIcon />)}
          {mark("underline", "Underline", <UnderlineIcon />)}
        </ToolbarGroup>
        <ToolbarSeparator />
        <ToolbarGroup>
          {list("bulletList", "Bulleted list", <ListIcon />)}
          {list("orderedList", "Lettered list", <ListOrderedIcon />)}
          <Tooltip content={state.inTable ? "Add a row" : "Insert a table"}>
            <ToolbarButton
              render={
                <IconButton
                  variant="ghost"
                  size="icon-sm"
                  aria-label={state.inTable ? "Add a row" : "Insert a table"}
                />
              }
              onClick={() =>
                state.inTable
                  ? editor.chain().focus().addRowAfter().run()
                  : editor
                      .chain()
                      .focus()
                      .insertTable({ rows: 3, cols: 2, withHeaderRow: true })
                      .run()
              }
            >
              <TableIcon />
            </ToolbarButton>
          </Tooltip>
        </ToolbarGroup>
        <ToolbarSeparator />
        <ToolbarGroup>
          <InsertBlank editor={editor} onNewBlank={onNewBlank} takenKeys={takenKeys} />
          <Tooltip content="Add a section after this one">
            <ToolbarButton
              render={<IconButton variant="ghost" size="icon-sm" aria-label="Add a section" />}
              onClick={() => addSectionAfterCursor(editor)}
            >
              <PlusIcon />
            </ToolbarButton>
          </Tooltip>
        </ToolbarGroup>
        <ToolbarSeparator />
        <ToolbarGroup>
          <Tooltip content="Undo">
            <ToolbarButton
              render={<IconButton variant="ghost" size="icon-sm" aria-label="Undo" />}
              disabled={!state.canUndo}
              onClick={() => editor.chain().focus().undo().run()}
            >
              <UndoIcon />
            </ToolbarButton>
          </Tooltip>
          <Tooltip content="Redo">
            <ToolbarButton
              render={<IconButton variant="ghost" size="icon-sm" aria-label="Redo" />}
              disabled={!state.canRedo}
              onClick={() => editor.chain().focus().redo().run()}
            >
              <RedoIcon />
            </ToolbarButton>
          </Tooltip>
        </ToolbarGroup>
      </Toolbar>
      <span className="ml-auto hidden text-muted-foreground text-xs lg:inline">
        Blanks are chips: click one to fill it, or answer in the chat.
      </span>
      <span className="text-muted-foreground text-sm" role="status">
        {status === "saving" || status === "pending" ? "Saving…" : null}
        {status === "saved" ? "Saved" : null}
        {status === "error" ? (
          <button type="button" className="underline underline-offset-4" onClick={onRetry}>
            Not saved. Retry
          </button>
        ) : null}
      </span>
    </div>
  )
}

/** Inserts a blank: one of the document's own, or a new one the person names. */
function InsertBlank({
  editor,
  onNewBlank,
  takenKeys,
}: {
  editor: Editor
  onNewBlank: (blank: NewBlank) => void
  takenKeys: string[]
}) {
  const { detail } = useGenerator()
  const [open, setOpen] = useState(false)
  const [label, setLabel] = useState("")
  const insert = (key: string) => {
    editor.chain().focus().insertContent({ type: "variable", attrs: { key } }).run()
    setOpen(false)
  }
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <Tooltip content="Insert a blank">
        <PopoverTrigger asChild>
          <ToolbarButton
            render={<IconButton variant="ghost" size="icon-sm" aria-label="Insert a blank" />}
          >
            <BracesIcon />
          </ToolbarButton>
        </PopoverTrigger>
      </Tooltip>
      <PopoverContent className="w-80">
        <div className="flex flex-col gap-3">
          <ul className="flex max-h-48 flex-col overflow-y-auto">
            {detail.version.data.variables.map((v) => (
              <li key={v.key}>
                <Button
                  variant="ghost"
                  size="sm"
                  className="w-full justify-start"
                  onClick={() => insert(v.key)}
                >
                  {v.label}
                </Button>
              </li>
            ))}
          </ul>
          <form
            className="flex flex-col gap-2 border-t pt-3"
            onSubmit={(e) => {
              e.preventDefault()
              const name = label.trim()
              if (!name) return
              onNewBlank({ key: blankKey(name, takenKeys), label: name, type: "text" })
              setLabel("")
              setOpen(false)
            }}
          >
            <Input label="New blank" value={label} onChange={(e) => setLabel(e.target.value)} />
            <div className="flex justify-end">
              <Button type="submit" size="sm" disabled={!label.trim()}>
                Insert
              </Button>
            </div>
          </form>
        </div>
      </PopoverContent>
    </Popover>
  )
}

/** A new, empty section after the one holding the cursor, with a fresh stable id. */
function addSectionAfterCursor(editor: Editor) {
  const { $from } = editor.state.selection
  const end = $from.depth >= 1 ? $from.after(1) : editor.state.doc.content.size
  editor
    .chain()
    .focus()
    .insertContentAt(end, {
      type: "section",
      attrs: { id: `s_${crypto.randomUUID().slice(0, 8)}`, title: "New section", numbered: true },
      content: [{ type: "paragraph" }],
    })
    .setTextSelection(end + 2)
    .run()
}
