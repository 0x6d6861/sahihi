import type { MDXComponents } from "mdx/types"
import type { ReactNode } from "react"

/** "Errors and limits" → "errors-and-limits": the anchor a page's own contents links to. */
function slug(children: ReactNode): string | undefined {
  const text = typeof children === "string" ? children : undefined
  return text
    ?.toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
}

/**
 * Styles for the MDX pages (security, privacy, terms, developers). This is the only place
 * long-form prose is styled; the pages themselves are plain Markdown.
 */
const components: MDXComponents = {
  h1: (props) => <h1 className="text-title" {...props} />,
  h2: (props) => <h2 id={slug(props.children)} className="text-sub mt-14 text-ink" {...props} />,
  h3: (props) => <h3 className="text-caption mt-8 text-ink" {...props} />,
  p: (props) => <p className="text-caption mt-4 font-normal text-muted" {...props} />,
  ul: (props) => <ul className="text-caption mt-4 space-y-2 font-normal text-muted" {...props} />,
  ol: (props) => (
    <ol
      className="text-caption mt-4 list-decimal space-y-2 pl-6 font-normal text-muted"
      {...props}
    />
  ),
  li: ({ children, ...props }) => (
    <li className="flex gap-3 [ol_&]:list-item" {...props}>
      <span aria-hidden className="text-faint [ol_&]:hidden">
        —
      </span>
      <span className="min-w-0">{children}</span>
    </li>
  ),
  a: (props) => (
    <a
      className="text-ink underline decoration-1 underline-offset-4 transition-opacity hover:opacity-60"
      {...props}
    />
  ),
  strong: (props) => <strong className="font-medium text-ink" {...props} />,
  // Inline code; inside a code block the <pre> sets the look instead.
  code: (props) => (
    <code
      className="font-mono text-[0.9em] text-ink [overflow-wrap:anywhere] [pre_&]:text-[inherit] [pre_&]:[overflow-wrap:normal]"
      {...props}
    />
  ),
  // Code blocks scroll sideways inside their panel, so a long line never widens the page.
  pre: ({ className = "", ...props }) => (
    <pre
      className={`mt-5 overflow-x-auto rounded-3xl bg-panel px-5 py-4 font-mono text-[0.8125rem] leading-6 text-ink md:px-6 md:text-[0.875rem] ${className}`}
      {...props}
    />
  ),
  blockquote: (props) => (
    <blockquote className="mt-8 rounded-3xl bg-panel px-6 py-1 pb-5 md:px-8" {...props} />
  ),
  hr: () => <hr className="mt-14 border-line" />,
}

export function useMDXComponents(): MDXComponents {
  return components
}
