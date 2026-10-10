"use client"

import { createContext, useContext } from "react"

/**
 * How the document pane shows the text (docs/ai-documents.md → Web): `preview` is read-only and a
 * click on a section attaches it to the next chat message; `editing` is the rich-text editor.
 * One editor serves both, so switching keeps the cursor, undo history and unsaved edits.
 */
export type DocMode = "preview" | "editing"

export const DocModeContext = createContext<DocMode>("editing")

export const useDocMode = () => useContext(DocModeContext)
