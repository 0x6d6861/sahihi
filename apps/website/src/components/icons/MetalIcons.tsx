/**
 * Metallic object icons drawn in SVG (brushed steel via layered gradients).
 * Render <MetalDefs /> once on the page before using <MetalIcon />.
 * Swap these for real 3D renders (transparent PNG/WebP) when you have them.
 */

export type MetalIconName = "compass" | "ruler" | "knob" | "puck" | "loupe" | "slider"

export function MetalDefs() {
  return (
    <svg width="0" height="0" className="absolute" aria-hidden>
      <defs>
        <linearGradient id="mt-h" x1="0" x2="1" y1="0" y2="0">
          <stop offset="0" stopColor="#6f6f6b" />
          <stop offset="0.18" stopColor="#e9e9e6" />
          <stop offset="0.38" stopColor="#9a9a95" />
          <stop offset="0.55" stopColor="#fafaf8" />
          <stop offset="0.78" stopColor="#8c8c87" />
          <stop offset="1" stopColor="#d6d6d2" />
        </linearGradient>
        <linearGradient id="mt-v" x1="0" x2="0" y1="0" y2="1">
          <stop offset="0" stopColor="#fbfbf9" />
          <stop offset="0.35" stopColor="#c9c9c5" />
          <stop offset="0.6" stopColor="#8e8e89" />
          <stop offset="1" stopColor="#d9d9d5" />
        </linearGradient>
        <radialGradient id="mt-top" cx="0.38" cy="0.32" r="0.75">
          <stop offset="0" stopColor="#ffffff" />
          <stop offset="0.35" stopColor="#d8d8d4" />
          <stop offset="0.7" stopColor="#9b9b96" />
          <stop offset="1" stopColor="#c8c8c4" />
        </radialGradient>
        <radialGradient id="mt-ring" cx="0.5" cy="0.5" r="0.5">
          <stop offset="0.7" stopColor="#b9b9b4" />
          <stop offset="0.85" stopColor="#f5f5f3" />
          <stop offset="1" stopColor="#77776f" />
        </radialGradient>
        <filter id="mt-shadow" x="-30%" y="-30%" width="160%" height="160%">
          <feGaussianBlur stdDeviation="2.5" />
        </filter>
      </defs>
    </svg>
  )
}

function Shadow({ cx = 40, cy = 72, rx = 22 }: { cx?: number; cy?: number; rx?: number }) {
  return (
    <ellipse cx={cx} cy={cy} rx={rx} ry="3.5" fill="#000" opacity="0.18" filter="url(#mt-shadow)" />
  )
}

const stroke = { stroke: "#5f5f5a", strokeWidth: 0.6, strokeOpacity: 0.55 }

const icons: Record<MetalIconName, React.ReactNode> = {
  compass: (
    <>
      <Shadow rx={18} />
      <path d="M37 14 L24 70 L27 70 L39.5 20 Z" fill="url(#mt-h)" {...stroke} />
      <path d="M43 14 L56 66 L53 67 L40.5 20 Z" fill="url(#mt-h)" {...stroke} />
      <path d="M55 52 L62 49 L63 52 L56 55 Z" fill="url(#mt-v)" {...stroke} />
      <rect x="38.6" y="4" width="2.8" height="8" rx="1.2" fill="url(#mt-v)" {...stroke} />
      <circle cx="40" cy="15" r="5" fill="url(#mt-top)" {...stroke} />
      <circle cx="40" cy="15" r="1.6" fill="#7d7d78" />
    </>
  ),
  ruler: (
    <>
      <Shadow rx={12} />
      <g transform="rotate(-12 40 40)">
        <rect x="32" y="8" width="16" height="62" rx="5" fill="url(#mt-h)" {...stroke} />
        {Array.from({ length: 10 }).map((_, i) => (
          <line
            // biome-ignore lint/suspicious/noArrayIndexKey: static list, never reordered
            key={i}
            x1="32.5"
            x2={i % 2 ? 36 : 38.5}
            y1={20 + i * 4.5}
            y2={20 + i * 4.5}
            stroke="#5f5f5a"
            strokeWidth="0.6"
          />
        ))}
        <circle cx="40" cy="14" r="2.6" fill="#f8f8f7" {...stroke} />
      </g>
    </>
  ),
  knob: (
    <>
      <Shadow rx={24} cy={66} />
      <path d="M16 40 L16 52 A24 9 0 0 0 64 52 L64 40 Z" fill="url(#mt-h)" {...stroke} />
      {Array.from({ length: 17 }).map((_, i) => (
        <line
          // biome-ignore lint/suspicious/noArrayIndexKey: static list, never reordered
          key={i}
          x1={17.5 + i * 2.8}
          x2={17.5 + i * 2.8}
          y1="42"
          y2="56"
          stroke="#4f4f4a"
          strokeWidth="0.4"
          strokeOpacity="0.5"
        />
      ))}
      <ellipse cx="40" cy="40" rx="24" ry="9" fill="url(#mt-ring)" {...stroke} />
      <path
        d="M26 39 L26 30 A14 5 0 0 0 54 30 L54 39 A14 5 0 0 1 26 39 Z"
        fill="url(#mt-h)"
        {...stroke}
      />
      <ellipse cx="40" cy="30" rx="14" ry="5" fill="url(#mt-top)" {...stroke} />
    </>
  ),
  puck: (
    <>
      <Shadow rx={26} cy={68} />
      <path
        d="M12 44 Q12 36 20 36 L60 36 Q68 36 68 44 L68 54 Q68 62 60 62 L20 62 Q12 62 12 54 Z"
        fill="url(#mt-v)"
        {...stroke}
      />
      <path
        d="M14 42 Q14 30 24 30 L56 30 Q66 30 66 42 Q66 50 56 50 L24 50 Q14 50 14 42 Z"
        fill="url(#mt-top)"
        {...stroke}
      />
      <path
        d="M30 40 L30 30 A10 4 0 0 0 50 30 L50 40 A10 4 0 0 1 30 40 Z"
        fill="url(#mt-h)"
        {...stroke}
      />
      <ellipse cx="40" cy="30" rx="10" ry="4" fill="url(#mt-top)" {...stroke} />
    </>
  ),
  loupe: (
    <>
      <Shadow cx={44} rx={18} />
      <path d="M44 44 L64 66 L60.5 69.5 L40.5 47.5 Z" fill="url(#mt-h)" {...stroke} />
      <circle cx="32" cy="32" r="17" fill="url(#mt-ring)" {...stroke} />
      <circle cx="32" cy="32" r="13" fill="#f2f2f0" fillOpacity="0.6" {...stroke} />
      <path
        d="M23 26 A11 11 0 0 1 34 21"
        stroke="#fff"
        strokeWidth="1.6"
        fill="none"
        strokeLinecap="round"
        opacity="0.9"
      />
    </>
  ),
  slider: (
    <>
      <Shadow rx={30} cy={56} />
      <rect x="8" y="34" width="64" height="16" rx="8" fill="url(#mt-v)" {...stroke} />
      <rect x="12" y="40" width="44" height="4" rx="2" fill="#a9a9a4" />
      <text x="16" y="43.6" fontSize="3.2" fill="#6f6f6a" fontFamily="ui-monospace,monospace">
        prompt
      </text>
      <circle cx="62" cy="42" r="6" fill="url(#mt-top)" {...stroke} />
    </>
  ),
}

export function MetalIcon({ name, className = "" }: { name: MetalIconName; className?: string }) {
  return (
    <svg viewBox="0 0 80 80" className={className} aria-hidden>
      {icons[name]}
    </svg>
  )
}
