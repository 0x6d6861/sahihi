"use client"

import { LABEL_COLOR_PRESETS, labelColorName, normalizeLabelColor } from "@sahihi/core"
import { forwardRef, useEffect, useState } from "react"
import { Button } from "@/components/arc/button/button"
import {
  ColorPicker as ArcColorPicker,
  type ColorSwatch,
} from "@/components/arc/color-picker/color-picker"

/** Arc's swatch row fits seven beside its "+" button; teal and gray stay valid, just not saved. */
const SWATCH_ROOM = 7
const PRESET_SWATCHES: ColorSwatch[] = LABEL_COLOR_PRESETS.filter(
  (p) => p.name !== "Teal" && p.name !== "Gray",
).map((p) => ({ id: p.name.toLowerCase(), color: p.color }))

/** The page background as the browser resolved it, for the picker's contrast readout. */
function usePageBackground(): string {
  const [background, setBackground] = useState("#FFFFFF")
  useEffect(() => {
    const value = getComputedStyle(document.body).backgroundColor
    if (value) setBackground(value)
  }, [])
  return background
}

/**
 * A label colour or none (ADR 0025): Arc `ColorPicker` with the presets as saved swatches, plus
 * "Remove color". Without a colour, one "Add color" button starts from blue. The ref is the root,
 * so a dialog can tell when Escape belongs to the open picker.
 */
export const LabelColorField = forwardRef<
  HTMLDivElement,
  { value: string | null; onChange: (color: string | null) => void }
>(function LabelColorField({ value, onChange }, ref) {
  const [swatches, setSwatches] = useState(PRESET_SWATCHES)
  const background = usePageBackground()

  return (
    <div ref={ref} className="flex flex-wrap items-center gap-2">
      {value ? (
        <>
          <ArcColorPicker
            label={labelColorName(value)}
            value={value}
            onValueChange={(hex) => onChange(normalizeLabelColor(hex) ?? hex)}
            background={background}
            swatches={swatches}
            onSwatchesChange={setSwatches}
            maxSwatches={SWATCH_ROOM}
          />
          <Button variant="ghost" size="sm" type="button" onClick={() => onChange(null)}>
            Remove color
          </Button>
        </>
      ) : (
        <Button
          variant="secondary"
          size="sm"
          type="button"
          onClick={() => onChange(LABEL_COLOR_PRESETS[5].color)}
        >
          Add color
        </Button>
      )}
    </div>
  )
})
