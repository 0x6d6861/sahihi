# Hero scroll sequence

This is the only pinned, scroll-scrubbed animation on the page, implemented in `src/components/sections/HeroStory.tsx`. It tells the product story without words: **drafting, sending and proving become one envelope.** The three frames merge into `AppWindow`, a completed envelope with its recipients and activity.

## Structure

```
<div ref h-[320svh]>                       ← scroll track (3.2 viewports)
  <div sticky top-0 h-svh overflow-hidden>  ← stage, pinned while the track scrolls
    frames container   top-16 md:top-24 h-[52svh]  ← the three tilted ChromeFrames + mono labels (clears the header)
    merged window      centred, min(94vw,1120px), ChromeFrame 16/10 → <AppWindow/>
    hero copy          top-[57svh], centred  ← headline, subtitle, CTAs, "works with"
```

`p` is `useScroll({ target: ref, offset: ["start start", "end end"] }).scrollYProgress`. It goes from 0 when the track's top meets the viewport top to 1 when the track's bottom meets the viewport bottom.

## Timeline

| p | What happens | Motion value |
|---|---|---|
| 0 → 0.05 | Hero copy holds at full opacity (≈100px of scroll), so a small scroll or a restored scroll position doesn't leave it half-faded | — |
| 0.05 → 0.14 | Hero copy fades out and rises 40px | `textOpacity` 1→0, `textY` 0→-40 |
| ≥ 0.12 | Hero copy stops taking clicks | `textPointer` "auto"→"none" |
| 0.10 → 0.30 | Frames straighten from their initial tilt to a smaller one and drop 12svh into the space the copy left | per-frame `rotate`, `y` |
| 0.12 → 0.20 | Pillar labels (DRAFT / SEND / PROVE) fade in | `labelOpacity` 0→1 |
| 0.36 → 0.42 | Labels fade out | `labelOpacity` 1→0 |
| 0.36 → 0.60 | Frames converge (outer frames move ±16vw to the centre), go fully straight, rise to 10svh and scale 1→1.25 | `x`, `rotate`, `y`, `framesScale` |
| 0.48 → 0.60 | Frames fade out | `framesOpacity` 1→0 |
| 0.46 → 0.66 | Merged app window fades in and grows 0.86→1 | `windowOpacity`, `windowScale` |
| 0.66 → 1.00 | Hold on the merged window, then the page scrolls on to the pillar intro | — |

The fade-out of the frames overlaps the fade-in of the window (0.46–0.62), so the eye reads it as one object becoming another.

## Frame config

Each frame is an entry in the `frames` array:

| key | screen | aspect | rotate [initial, settled] | shift (converge) | position (mobile → `md`) |
|---|---|---|---|---|---|
| draft | `DraftScreen` | 1.1/1 | [-8°, -4°] | 0 → +16vw | `left-[7%] top-[26%] w-[32%]` → `md:left-[14%] md:top-[12%] md:w-[25%]` |
| send | `SendScreen` | 1.05/1 | [3°, 1°] | none | `left-[35%] top-[16%] w-[30%]` → `md:left-[40%] md:top-[6%] md:w-[20%]` |
| prove | `ProveScreen` | 0.95/1 | [9°, 4°] | 0 → -16vw | `left-[61%] top-[28%] w-[32%]` → `md:left-[62%] md:top-[15%] md:w-[21%]` |

Positions are percentages of the frames container (`52svh` tall, max 1400px wide). The pillar label for each frame is `site.pillars[index]`, so the order of `frames` must match the order of `pillars`.

The screens are visible from scroll 0. Empty bezels on first load read as a loading skeleton, and most visitors judge the page before they scroll. The mobile positions keep the tilted corners inside the 16px gutter at 390px; recheck that if you change a mobile `w-` or `left-`, or the tilt.

## Performance rules

- Animate **only** `opacity`, `x`, `y`, `rotate` and `scale`. Motion turns these into `transform`/`opacity`, which the compositor handles without repainting.
- **Never** scrub `filter`, `blur`, `backdrop-filter`, `box-shadow`, `clip-path`, width or height with scroll. The original site did heavy scroll effects and froze Chrome's renderer twice during review.
- Each frame and the window have `will-change-transform`. Don't add it anywhere else; too many layers costs memory.
- The mockups inside the frames are static HTML, so they cost nothing per frame.

## Interaction rules

- The frames container and the merged window are `pointer-events-none`. They are pictures.
- The hero copy's `pointerEvents` is driven by `p`, so faded buttons can't be clicked. Keep that if you change the timing.

## Reduced motion

`useSafeReducedMotion()` switches to `StaticHero`, which has no pinning and no scrubbing. The hook reports reduced motion only after hydration, so the server HTML and the first client render match; reduced-motion visitors see the animated tree's first frame for a moment before the swap. The static version is:
1. the three frames, already filled, at their settled tilt, with labels
2. the hero copy
3. the merged window, below the copy

## Tuning recipes

| Want | Change |
|---|---|
| A longer or shorter story | the track height `h-[320svh]` (more height means slower scrubbing; keep it ≥ 260svh; then update the hero stops in `scripts/screenshots.mjs`) |
| Labels on screen longer | widen the hold in `labelOpacity`, e.g. `[0.12, 0.2, 0.42, 0.48]` |
| A later merge | shift the `0.36/0.48/0.6` stops and the window's `0.46/0.62/0.66` stops by the same amount |
| Different pillars | change `site.pillars`, the `frames` screens and `AppWindow` together |
| A fourth frame | add an entry with its own `pos`/`rotate`/`shift`, a fourth pillar, and rebalance the positions; check 390px |

## Testing it

`bun run shots` takes six screenshots inside the track. The track is 320svh, so it scrolls for 2.2 viewports, and the shots are taken at 0, 0.3, 0.55, 1.0, 1.5 and 2.05 viewports (progress ≈ 0, .14, .25, .45, .68, .93). If you change the track height, update those stops in `scripts/screenshots.mjs`. Check in order:
1. filled, tilted frames with the headline
2. headline nearly gone, frames dropping
3. labels visible
4. converging frames
5. merged window
6. merged window held

For reduced motion, use the DevTools Rendering panel ("Emulate CSS prefers-reduced-motion: reduce") and confirm the static stack appears.
