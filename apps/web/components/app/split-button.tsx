"use client"

import {
  SplitButton as ArcSplitButton,
  type SplitButtonProps,
} from "@/components/arc/split-button/split-button"

export type {
  SplitButtonAction,
  SplitButtonProps,
} from "@/components/arc/split-button/split-button"

/**
 * Arc's SplitButton with the app's emerald primary (ADR 0060). It takes no class, so the token remap
 * sits on a wrapper; the menu is portaled outside it and keeps the page's colours.
 */
export function SplitButton(props: SplitButtonProps) {
  const primary = (props.variant ?? "primary") === "primary"
  return (
    <span className={primary ? "app-primary contents" : "contents"}>
      <ArcSplitButton {...props} />
    </span>
  )
}
