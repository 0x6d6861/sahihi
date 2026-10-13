/**
 * The Sahihi mark: ※ drawn as a stamp, a saltire with a square in each gap. It takes the text
 * colour (currentColor), so it follows the theme. Size it with `className` (it's 1em by default).
 * The same paths are in app/icon.svg and app/opengraph-image.tsx; change all three together.
 */
export function LogoMark({ className = "size-[1em]" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden className={className}>
      <path
        d="M5.9 5.9l12.2 12.2M18.1 5.9L5.9 18.1"
        stroke="currentColor"
        strokeWidth="3.6"
        strokeLinecap="square"
      />
      <rect x="10" y="0.9" width="4" height="4" fill="currentColor" />
      <rect x="19.1" y="10" width="4" height="4" fill="currentColor" />
      <rect x="10" y="19.1" width="4" height="4" fill="currentColor" />
      <rect x="0.9" y="10" width="4" height="4" fill="currentColor" />
    </svg>
  )
}
