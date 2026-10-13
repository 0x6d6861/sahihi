/**
 * Metallic object icons drawn in SVG (brushed steel via layered gradients).
 * Render <MetalDefs /> once on the page before using <MetalIcon />.
 * Swap these for real 3D renders (transparent PNG/WebP) when you have them.
 */

export type MetalIconName = "quill" | "brackets" | "tray" | "stack" | "padlock" | "clip"

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
  // A fountain-pen nib, point down.
  quill: (
    <>
      <Shadow rx={14} />
      <g transform="rotate(18 40 40)">
        <rect x="33" y="4" width="14" height="22" rx="4" fill="url(#mt-h)" {...stroke} />
        <rect x="32" y="24" width="16" height="5" rx="1.5" fill="url(#mt-v)" {...stroke} />
        <path d="M32 29 L48 29 L46 46 L40 68 L34 46 Z" fill="url(#mt-h)" {...stroke} />
        <line x1="40" y1="44" x2="40" y2="67" stroke="#5f5f5a" strokeWidth="0.7" />
        <circle cx="40" cy="42" r="2.2" fill="#f8f8f7" {...stroke} />
      </g>
    </>
  ),
  // Square brackets around a blank.
  brackets: (
    <>
      <Shadow rx={24} />
      <path
        d="M22 14 L32 14 L32 20 L28 20 L28 60 L32 60 L32 66 L22 66 Z"
        fill="url(#mt-h)"
        {...stroke}
      />
      <path
        d="M58 14 L48 14 L48 20 L52 20 L52 60 L48 60 L48 66 L58 66 Z"
        fill="url(#mt-h)"
        {...stroke}
      />
      <rect x="34" y="44" width="12" height="4" rx="2" fill="url(#mt-v)" {...stroke} />
    </>
  ),
  // A shallow tray with a sheet dropping in.
  tray: (
    <>
      <Shadow rx={28} cy={68} />
      <path d="M26 10 L54 10 L54 46 L26 46 Z" fill="#f4f4f2" {...stroke} />
      {[18, 24, 30, 36].map((y) => (
        <line
          key={y}
          x1="31"
          x2={y === 36 ? 42 : 49}
          y1={y}
          y2={y}
          stroke="#9a9a95"
          strokeWidth="1.2"
        />
      ))}
      <path
        d="M10 44 L24 44 L28 52 L52 52 L56 44 L70 44 L70 62 Q70 64 68 64 L12 64 Q10 64 10 62 Z"
        fill="url(#mt-v)"
        {...stroke}
      />
      <path
        d="M10 44 L24 44 L28 52 L52 52 L56 44 L70 44"
        fill="none"
        stroke="#fff"
        strokeOpacity="0.8"
        strokeWidth="0.8"
      />
    </>
  ),
  // Three sheets stacked at a slant.
  stack: (
    <>
      <Shadow rx={24} />
      <rect
        x="22"
        y="22"
        width="34"
        height="44"
        rx="3"
        fill="url(#mt-v)"
        transform="rotate(-10 39 44)"
        {...stroke}
      />
      <rect
        x="24"
        y="18"
        width="34"
        height="44"
        rx="3"
        fill="url(#mt-h)"
        transform="rotate(-3 41 40)"
        {...stroke}
      />
      <rect
        x="26"
        y="14"
        width="34"
        height="44"
        rx="3"
        fill="#f6f6f4"
        transform="rotate(5 43 36)"
        {...stroke}
      />
      <g transform="rotate(5 43 36)">
        {[24, 30, 36, 42].map((y) => (
          <line
            key={y}
            x1="31"
            x2={y === 42 ? 44 : 54}
            y1={y}
            y2={y}
            stroke="#a3a39e"
            strokeWidth="1.2"
          />
        ))}
      </g>
    </>
  ),
  padlock: (
    <>
      <Shadow rx={20} />
      <path
        d="M28 36 L28 26 A12 12 0 0 1 52 26 L52 36 L47 36 L47 26 A7 7 0 0 0 33 26 L33 36 Z"
        fill="url(#mt-h)"
        {...stroke}
      />
      <rect x="20" y="34" width="40" height="34" rx="6" fill="url(#mt-v)" {...stroke} />
      <rect x="22" y="36" width="36" height="6" rx="3" fill="#fff" opacity="0.35" />
      <circle cx="40" cy="50" r="4" fill="#77776f" />
      <rect x="38.6" y="52" width="2.8" height="8" rx="1.2" fill="#77776f" />
    </>
  ),
  clip: (
    <>
      <Shadow rx={12} />
      <g transform="rotate(20 40 40)">
        <path
          d="M46 22 L46 56 A8 8 0 0 1 30 56 L30 18 A12 12 0 0 1 54 18 L54 54"
          fill="none"
          stroke="url(#mt-h)"
          strokeWidth="4.5"
          strokeLinecap="round"
        />
        <path
          d="M46 22 L46 56 A8 8 0 0 1 30 56 L30 18 A12 12 0 0 1 54 18 L54 54"
          fill="none"
          stroke="#5f5f5a"
          strokeOpacity="0.45"
          strokeWidth="0.6"
        />
      </g>
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
