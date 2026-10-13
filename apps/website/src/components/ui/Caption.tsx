/** The site-wide caption pattern: medium-weight ink lead phrase, then regular grey text. */
export function Caption({
  lead,
  text,
  className = "",
}: {
  lead: string
  text: string
  className?: string
}) {
  return (
    <p className={`text-lede font-normal text-muted ${className}`}>
      <span className="font-medium text-ink">{lead}</span> {text}
    </p>
  )
}
