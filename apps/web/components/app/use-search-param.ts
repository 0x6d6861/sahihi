"use client"

import { usePathname, useRouter, useSearchParams } from "next/navigation"
import { useCallback } from "react"

/**
 * A choice kept in the URL (`?key=`) so a reload, or a "Fix" link, lands on the same one.
 * `resolve` turns the raw value (null when absent) into a valid choice.
 */
export function useSearchParamState<T extends string>(
  key: string,
  resolve: (raw: string | null) => T,
) {
  const router = useRouter()
  const pathname = usePathname()
  const params = useSearchParams()
  const value = resolve(params.get(key))
  const setValue = useCallback(
    (next: T) => {
      const q = new URLSearchParams(params.toString())
      q.set(key, next)
      router.replace(`${pathname}?${q.toString()}`, { scroll: false })
    },
    [key, params, pathname, router],
  )
  return [value, setValue] as const
}
