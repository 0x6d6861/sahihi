"use client"

import { forwardRef, useId, useState } from "react"
import { EyeIcon, EyeOffIcon, SearchIcon, XIcon } from "@/components/app/icons"
import { Input as ShadcnInput } from "@/components/shadcn/input"
import { Label } from "@/components/shadcn/label"
import { Textarea as ShadcnTextarea } from "@/components/shadcn/textarea"
import { Button as IconButton } from "@/components/ui/button"
import { cn } from "@/lib/utils"

/**
 * Text fields on shadcn's default input, textarea and label (ADR 0063) while Arc's filled input
 * patch is pending. Same props as Arc's `Input`, `Textarea` and `PasswordField` (`label`,
 * `description`, `error`), so switching back is an import change. Import from here, never from
 * `components/arc/input|textarea|password-field` or `components/shadcn/` directly.
 */

interface FieldProps {
  label: string
  description?: string
  error?: string
}

interface InputOnlyProps {
  /** E.g. `md:sr-only` in a table whose column header names the field from `md`. */
  labelClassName?: string
}

/** Label, control, then the description and error under it, wired with aria-describedby. */
function useField(id: string | undefined, { description, error }: FieldProps) {
  const generated = useId()
  const controlId = id ?? generated
  const hintId = description ? `${controlId}-description` : undefined
  const errorId = error ? `${controlId}-error` : undefined
  return { controlId, hintId, errorId }
}

function Messages({
  hintId,
  errorId,
  description,
  error,
}: {
  hintId?: string
  errorId?: string
  description?: string
  error?: string
}) {
  return (
    <>
      {description && (
        <p id={hintId} className="text-muted-foreground text-xs">
          {description}
        </p>
      )}
      {error && (
        <p id={errorId} role="alert" className="text-destructive-foreground text-xs">
          {error}
        </p>
      )}
    </>
  )
}

const describedBy = (...ids: (string | undefined)[]) => ids.filter(Boolean).join(" ") || undefined

export type InputProps = FieldProps & InputOnlyProps & React.InputHTMLAttributes<HTMLInputElement>

export const Input = forwardRef<HTMLInputElement, InputProps>(function Input(
  { label, labelClassName, description, error, id, className, ...props },
  ref,
) {
  const { controlId, hintId, errorId } = useField(id, { label, description, error })
  return (
    <div className="flex flex-col gap-2">
      <Label htmlFor={controlId} className={labelClassName}>
        {label}
      </Label>
      <ShadcnInput
        {...props}
        ref={ref}
        id={controlId}
        className={className}
        aria-invalid={error ? true : props["aria-invalid"]}
        aria-describedby={describedBy(props["aria-describedby"], hintId, errorId)}
      />
      <Messages hintId={hintId} errorId={errorId} description={description} error={error} />
    </div>
  )
})

export type TextareaProps = FieldProps & React.TextareaHTMLAttributes<HTMLTextAreaElement>

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaProps>(function Textarea(
  { label, description, error, id, className, ...props },
  ref,
) {
  const { controlId, hintId, errorId } = useField(id, { label, description, error })
  return (
    <div className="flex flex-col gap-2">
      <Label htmlFor={controlId}>{label}</Label>
      <ShadcnTextarea
        {...props}
        ref={ref}
        id={controlId}
        className={className}
        aria-invalid={error ? true : props["aria-invalid"]}
        aria-describedby={describedBy(props["aria-describedby"], hintId, errorId)}
      />
      <Messages hintId={hintId} errorId={errorId} description={description} error={error} />
    </div>
  )
})

export type PasswordFieldProps = FieldProps &
  Omit<React.InputHTMLAttributes<HTMLInputElement>, "type">

/** A password input with a show / hide toggle inside its right edge. */
export const PasswordField = forwardRef<HTMLInputElement, PasswordFieldProps>(
  function PasswordField({ label, description, error, id, className, ...props }, ref) {
    const { controlId, hintId, errorId } = useField(id, { label, description, error })
    const [visible, setVisible] = useState(false)
    return (
      <div className="flex flex-col gap-2">
        <Label htmlFor={controlId}>{label}</Label>
        <div className="relative">
          <ShadcnInput
            {...props}
            ref={ref}
            id={controlId}
            type={visible ? "text" : "password"}
            className={cn("pe-9", className)}
            aria-invalid={error ? true : props["aria-invalid"]}
            aria-describedby={describedBy(props["aria-describedby"], hintId, errorId)}
          />
          <IconButton
            type="button"
            variant="ghost"
            size="icon-xs"
            className="absolute end-1 top-1/2 -translate-y-1/2 text-muted-foreground"
            aria-label={visible ? "Hide password" : "Show password"}
            aria-pressed={visible}
            onClick={() => setVisible((v) => !v)}
          >
            {visible ? <EyeOffIcon aria-hidden /> : <EyeIcon aria-hidden />}
          </IconButton>
        </div>
        <Messages hintId={hintId} errorId={errorId} description={description} error={error} />
      </div>
    )
  },
)

export type SearchInputProps = Omit<
  React.InputHTMLAttributes<HTMLInputElement>,
  "type" | "value"
> & {
  /** Read by assistive tech; not shown (the placeholder and the icon say it's a search). */
  label: string
  value: string
  onValueChange: (value: string) => void
}

/** A filled search field (the list toolbars): icon, input, and a clear button once something is typed. */
export const SearchInput = forwardRef<HTMLInputElement, SearchInputProps>(function SearchInput(
  { label, value, onValueChange, id, className, ...props },
  ref,
) {
  const generated = useId()
  const controlId = id ?? generated
  return (
    <div className="relative">
      <label htmlFor={controlId} className="sr-only">
        {label}
      </label>
      <SearchIcon
        aria-hidden
        className="pointer-events-none absolute start-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
      />
      <ShadcnInput
        {...props}
        ref={ref}
        id={controlId}
        type="search"
        value={value}
        onChange={(e) => onValueChange(e.target.value)}
        className={cn(
          "rounded-2xl border-transparent bg-muted ps-8 pe-8 dark:bg-muted [&::-webkit-search-cancel-button]:appearance-none",
          className,
        )}
      />
      {value && (
        <IconButton
          type="button"
          variant="ghost"
          size="icon-xs"
          className="absolute end-1 top-1/2 -translate-y-1/2 text-muted-foreground"
          aria-label="Clear search"
          onClick={() => onValueChange("")}
        >
          <XIcon aria-hidden />
        </IconButton>
      )}
    </div>
  )
})
