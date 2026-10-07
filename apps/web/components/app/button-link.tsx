import Link from "next/link"
import type { ComponentProps } from "react"
import type { ButtonSize, ButtonVariant } from "@/components/arc/button/button"
import styles from "@/components/arc/button/button.module.css"
import { cn } from "@/lib/utils"

/**
 * Navigation that looks like an Arc button. Arc's Button is a native <button> with no link variant,
 * so this applies its stylesheet to next/link instead (ADR 0023). Use a real Button for actions.
 */
export function ButtonLink({
  variant = "secondary",
  size = "md",
  className,
  ...props
}: ComponentProps<typeof Link> & { variant?: ButtonVariant; size?: ButtonSize }) {
  return (
    <Link
      className={cn(styles.button, styles[variant], styles[size], "no-underline", className)}
      {...props}
    />
  )
}
