import "server-only"
import { cookies } from "next/headers"

const API_URL = process.env.API_URL ?? "http://localhost:4000"

/** Server Component / Route Handler fetch to the API with the user's cookies. */
export async function apiServer<T>(
  path: string,
  init: RequestInit = {},
): Promise<{ status: number; data: T | null }> {
  const cookieHeader = (await cookies()).toString()
  const res = await fetch(`${API_URL}/api${path}`, {
    ...init,
    headers: { ...init.headers, cookie: cookieHeader },
    cache: "no-store",
  })
  const data = res.ok ? ((await res.json().catch(() => null)) as T | null) : null
  return { status: res.status, data }
}

export interface ServerSession {
  user: { id: string; name: string; email: string; emailVerified: boolean; image?: string | null }
  session: { id: string; activeOrganizationId?: string | null; expiresAt: string }
}

export async function getServerSession(): Promise<ServerSession | null> {
  const { data } = await apiServer<ServerSession | null>("/auth/get-session")
  return data ?? null
}
