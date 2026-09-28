/**
 * Browser-side API helper. All calls are same-origin (/api/*).
 * Server Components must use lib/api-server.ts instead (forwards cookies).
 */
export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly body: {
      error?: string
      message?: string
      issues?: { path: string; message: string }[]
    } | null,
  ) {
    super(body?.message ?? body?.error ?? `Request failed (${status})`)
    this.name = "ApiError"
  }
}

export async function api<T>(
  path: string,
  init: RequestInit & { json?: unknown } = {},
): Promise<T> {
  const { json, headers, ...rest } = init
  const res = await fetch(`/api${path}`, {
    credentials: "include",
    ...rest,
    headers: { ...(json !== undefined ? { "Content-Type": "application/json" } : {}), ...headers },
    body: json !== undefined ? JSON.stringify(json) : rest.body,
  })
  const body = res.status === 204 ? null : await res.json().catch(() => null)
  if (!res.ok) throw new ApiError(res.status, body)
  return body as T
}
