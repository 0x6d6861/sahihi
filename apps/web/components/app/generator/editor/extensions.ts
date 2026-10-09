import { mergeAttributes, Node } from "@tiptap/core"
import { ListItem } from "@tiptap/extension-list"
import { Table, TableCell, TableHeader, TableRow } from "@tiptap/extension-table"
import { ReactNodeViewRenderer } from "@tiptap/react"
import StarterKit from "@tiptap/starter-kit"
import { BlankView } from "./blank-view"
import { SectionView } from "./section-view"
import { SignatureBlockView } from "./signature-block-view"

/**
 * The editor's schema mirrors `DocContentSchema` (@sahihi/core, docs/ai-documents.md → Editing):
 * a document is sections; a section holds paragraphs, lists, tables and signature blocks; inline
 * there is text (bold, italic, underline) and atomic blanks. Anything else the editor could make
 * (headings, quotes, code, links, hard breaks) is turned off, so pasted content is reduced to what
 * the model and the PDF renderer support.
 */

const Document = Node.create({ name: "doc", topNode: true, content: "section+" })

const Section = Node.create({
  name: "section",
  content: "block+",
  defining: true,
  isolating: true,
  addAttributes() {
    return {
      id: { default: null },
      title: { default: "New section" },
      numbered: { default: true },
    }
  },
  parseHTML: () => [{ tag: "section[data-section]" }],
  renderHTML: ({ HTMLAttributes }) => [
    "section",
    mergeAttributes(HTMLAttributes, { "data-section": "" }),
    0,
  ],
  addNodeView: () => ReactNodeViewRenderer(SectionView),
})

/** A blank: an atomic inline node that points at a variable; its value lives outside the text. */
const Variable = Node.create({
  name: "variable",
  group: "inline",
  inline: true,
  atom: true,
  selectable: true,
  addAttributes: () => ({ key: { default: null } }),
  parseHTML: () => [{ tag: "span[data-variable]" }],
  renderHTML: ({ HTMLAttributes }) => [
    "span",
    mergeAttributes(HTMLAttributes, { "data-variable": "" }),
  ],
  addNodeView: () => ReactNodeViewRenderer(BlankView, { as: "span" }),
})

/** Where one signer signs: atomic here; its caption and fields travel in `items`. */
const SignatureBlock = Node.create({
  name: "signatureBlock",
  group: "block",
  atom: true,
  draggable: true,
  addAttributes: () => ({ roleKey: { default: null }, items: { default: [] } }),
  parseHTML: () => [{ tag: "div[data-signature-block]" }],
  renderHTML: ({ HTMLAttributes }) => [
    "div",
    mergeAttributes(HTMLAttributes, { "data-signature-block": "" }),
  ],
  addNodeView: () => ReactNodeViewRenderer(SignatureBlockView),
})

export const editorExtensions = [
  StarterKit.configure({
    document: false,
    heading: false,
    blockquote: false,
    codeBlock: false,
    code: false,
    horizontalRule: false,
    strike: false,
    link: false,
    hardBreak: false,
    listItem: false,
    trailingNode: false,
  }),
  Document,
  Section,
  Variable,
  SignatureBlock,
  // The model's list item is exactly one paragraph (no nesting yet).
  ListItem.extend({ content: "paragraph" }),
  Table.configure({ resizable: false }),
  TableRow,
  TableHeader.extend({ content: "paragraph+" }),
  TableCell.extend({ content: "paragraph+" }),
]
