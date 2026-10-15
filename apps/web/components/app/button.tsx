"use client"

import { forwardRef } from "react"
import { Button as ArcButton, type ButtonProps } from "@/components/arc/button/button"
import { cn } from "@/lib/utils"

export type { ButtonProps, ButtonSize, ButtonVariant } from "@/components/arc/button/button"

/**
 * Arc's Button with the app's emerald primary (ADR 0060). Arc paints its primary variant from
 * `--foreground` / `--background`, so the `app-primary` class (app.css) remaps those two tokens on the
 * button itself; every other variant is Arc's as shipped. Import this, never the Arc file directly.
 */
export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = "primary", className, ...props },
  ref,
) {
  return (
    <ArcButton
      ref={ref}
      variant={variant}
      className={cn(variant === "primary" && "app-primary", className)}
      {...props}
    />
  )
})
