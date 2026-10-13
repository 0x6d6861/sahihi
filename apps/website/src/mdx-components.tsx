import type { MDXComponents } from "mdx/types"

/**
 * Styles for the MDX pages (security, privacy, terms). This is the only place
 * long-form prose is styled; the pages themselves are plain Markdown.
 */
const components: MDXComponents = {
  h1: (props) => <h1 className="text-title" {...props} />,
  h2: (props) => <h2 className="text-sub mt-14 text-ink" {...props} />,
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
      <span>{children}</span>
    </li>
  ),
  a: (props) => (
    <a
      className="text-ink underline decoration-1 underline-offset-4 transition-opacity hover:opacity-60"
      {...props}
    />
  ),
  strong: (props) => <strong className="font-medium text-ink" {...props} />,
  code: (props) => <code className="font-mono text-[0.9em] text-ink" {...props} />,
  blockquote: (props) => (
    <blockquote className="mt-8 rounded-3xl bg-panel px-6 py-1 pb-5 md:px-8" {...props} />
  ),
  hr: () => <hr className="mt-14 border-line" />,
}

export function useMDXComponents(): MDXComponents {
  return components
}
