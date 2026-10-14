import { createHash } from "node:crypto"
import { getEnv } from "@sahihi/config"
import { decryptSecret, encryptSecret } from "@sahihi/core"
import { WriteOnceError } from "./types"

/**
 * Google Drive and OneDrive as sync destinations (docs/storage.md → Cloud drives). Plain `fetch`
 * against their REST APIs, with the narrowest scopes they offer: Drive's `drive.file` (only files
 * Sahihi creates) and OneDrive's app folder (`Files.ReadWrite.AppFolder`). Uploads are write-once:
 * a file already there with the same bytes is skipped, a different one is refused.
 */

export type OAuthProvider = "GOOGLE_DRIVE" | "ONEDRIVE"
type Fetch = typeof fetch

const PROVIDERS = {
  GOOGLE_DRIVE: {
    slug: "google",
    authorizeUrl: "https://accounts.google.com/o/oauth2/v2/auth",
    tokenUrl: "https://oauth2.googleapis.com/token",
    scope: "openid email https://www.googleapis.com/auth/drive.file",
    extra: { access_type: "offline", prompt: "consent" } as Record<string, string>,
  },
  ONEDRIVE: {
    slug: "microsoft",
    authorizeUrl: "https://login.microsoftonline.com/common/oauth2/v2.0/authorize",
    tokenUrl: "https://login.microsoftonline.com/common/oauth2/v2.0/token",
    scope: "offline_access User.Read Files.ReadWrite.AppFolder",
    extra: { prompt: "select_account" } as Record<string, string>,
  },
} as const

export const oauthSlug = (p: OAuthProvider) => PROVIDERS[p].slug

/** The app's client id and secret, or null when the provider isn't set up (it's not offered). */
export function oauthClient(p: OAuthProvider) {
  const env = getEnv()
  const [id, secret] =
    p === "GOOGLE_DRIVE"
      ? [env.GOOGLE_DRIVE_CLIENT_ID, env.GOOGLE_DRIVE_CLIENT_SECRET]
      : [env.MICROSOFT_CLIENT_ID, env.MICROSOFT_CLIENT_SECRET]
  return id && secret ? { clientId: id, clientSecret: secret } : null
}

export function oauthRedirectUri(p: OAuthProvider) {
  return `${getEnv().WEB_URL.replace(/\/$/, "")}/api/storage/oauth/${oauthSlug(p)}/callback`
}

export function oauthAuthorizeUrl(p: OAuthProvider, state: string): string {
  const client = oauthClient(p)
  if (!client) throw new Error(`${p} isn't configured`)
  const url = new URL(PROVIDERS[p].authorizeUrl)
  const params: Record<string, string> = {
    client_id: client.clientId,
    redirect_uri: oauthRedirectUri(p),
    response_type: "code",
    scope: PROVIDERS[p].scope,
    state,
    ...PROVIDERS[p].extra,
  }
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v)
  return url.toString()
}

/** A refusal from the provider, phrased for the settings page. */
export class DriveError extends Error {
  constructor(
    message: string,
    readonly status?: number,
  ) {
    super(message)
    this.name = "DriveError"
  }
}

async function tokenRequest(p: OAuthProvider, body: Record<string, string>, f: Fetch) {
  const client = oauthClient(p)
  if (!client) throw new DriveError(`${p} isn't configured`)
  const res = await f(PROVIDERS[p].tokenUrl, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: client.clientId,
      client_secret: client.clientSecret,
      ...body,
    }),
    signal: AbortSignal.timeout(15_000),
  })
  const json = (await res.json().catch(() => ({}))) as {
    access_token?: string
    refresh_token?: string
    id_token?: string
    error?: string
  }
  if (!res.ok || !json.access_token) {
    throw new DriveError(
      json.error === "invalid_grant"
        ? "Access was revoked or expired. Connect the account again."
        : "The provider refused the sign-in",
      res.status,
    )
  }
  return json
}

/** The callback: trade the code for a refresh token and find out which account it is. */
export async function exchangeOAuthCode(
  p: OAuthProvider,
  code: string,
  f: Fetch = fetch,
): Promise<{ refreshToken: string; accountEmail: string | null }> {
  const tokens = await tokenRequest(
    p,
    { grant_type: "authorization_code", code, redirect_uri: oauthRedirectUri(p) },
    f,
  )
  if (!tokens.refresh_token) {
    throw new DriveError("The provider didn't grant offline access. Try connecting again.")
  }
  let accountEmail: string | null = null
  if (p === "GOOGLE_DRIVE" && tokens.id_token) {
    // Straight from Google's token endpoint over TLS, so the claims need no signature check here.
    const payload = tokens.id_token.split(".")[1] ?? ""
    try {
      const claims = JSON.parse(Buffer.from(payload, "base64url").toString("utf8"))
      accountEmail = typeof claims.email === "string" ? claims.email : null
    } catch {
      accountEmail = null
    }
  } else if (p === "ONEDRIVE") {
    const me = await f("https://graph.microsoft.com/v1.0/me?$select=mail,userPrincipalName", {
      headers: { authorization: `Bearer ${tokens.access_token}` },
      signal: AbortSignal.timeout(15_000),
    })
    const body = (await me.json().catch(() => ({}))) as {
      mail?: string
      userPrincipalName?: string
    }
    accountEmail = body.mail ?? body.userPrincipalName ?? null
  }
  return { refreshToken: tokens.refresh_token, accountEmail }
}

export interface DriveConnection {
  id: string
  provider: string
  secretEncrypted: string | null
  rootFolder: string | null
}

/** A cloud drive, ready to receive files under `<rootFolder>/<folder path>/<name>`. */
export interface DriveDestination {
  /** Proves the token still works (no file is written). */
  check(): Promise<void>
  write(
    folder: string[],
    name: string,
    bytes: Uint8Array,
    contentType: string,
  ): Promise<"written" | "exists">
}

export async function driveDestination(
  conn: DriveConnection,
  opts: {
    fetch?: Fetch
    /** Microsoft rotates refresh tokens: persist the new one (already encrypted). */
    onRefreshToken?: (secretEncrypted: string) => Promise<void>
  } = {},
): Promise<DriveDestination> {
  const f = opts.fetch ?? fetch
  const p = conn.provider as OAuthProvider
  if (!(p in PROVIDERS) || !conn.secretEncrypted) throw new DriveError("Not a cloud drive")
  const secret = getEnv().BETTER_AUTH_SECRET
  const refreshToken = await decryptSecret(secret, conn.secretEncrypted)
  const tokens = await tokenRequest(
    p,
    { grant_type: "refresh_token", refresh_token: refreshToken },
    f,
  )
  if (tokens.refresh_token && tokens.refresh_token !== refreshToken) {
    await opts.onRefreshToken?.(await encryptSecret(secret, tokens.refresh_token))
  }
  const auth = { authorization: `Bearer ${tokens.access_token}` }
  const root = conn.rootFolder || "Sahihi"
  return p === "GOOGLE_DRIVE" ? googleDrive(f, auth, root) : oneDrive(f, auth, root)
}

const md5 = (bytes: Uint8Array) => createHash("md5").update(bytes).digest("hex")

async function ok(res: Response, what: string) {
  if (res.ok) return res
  const status = res.status
  throw new DriveError(
    status === 401 || status === 403
      ? `Access denied while ${what}. Connect the account again.`
      : status === 404
        ? `Not found while ${what}`
        : status === 429 || status >= 500
          ? `The provider is busy (HTTP ${status}) while ${what}`
          : `HTTP ${status} while ${what}`,
    status,
  )
}

function googleDrive(f: Fetch, auth: Record<string, string>, root: string): DriveDestination {
  const api = "https://www.googleapis.com/drive/v3"
  const q = (s: string) => s.replace(/\\/g, "\\\\").replace(/'/g, "\\'")
  const folderIds = new Map<string, string>()

  async function find(name: string, parent: string, folder: boolean) {
    const query = [
      `name = '${q(name)}'`,
      `'${q(parent)}' in parents`,
      "trashed = false",
      folder
        ? "mimeType = 'application/vnd.google-apps.folder'"
        : "mimeType != 'application/vnd.google-apps.folder'",
    ].join(" and ")
    const url = `${api}/files?q=${encodeURIComponent(query)}&fields=files(id,size,md5Checksum)&pageSize=1&spaces=drive`
    const res = await ok(await f(url, { headers: auth }), "looking for a folder")
    const body = (await res.json()) as {
      files?: { id: string; size?: string; md5Checksum?: string }[]
    }
    return body.files?.[0] ?? null
  }

  async function folderId(path: string[]): Promise<string> {
    let parent = "root"
    for (const [i, name] of path.entries()) {
      const key = path.slice(0, i + 1).join("/")
      const cached = folderIds.get(key)
      if (cached) {
        parent = cached
        continue
      }
      const existing = await find(name, parent, true)
      let id = existing?.id
      if (!id) {
        const res = await ok(
          await f(`${api}/files?fields=id`, {
            method: "POST",
            headers: { ...auth, "content-type": "application/json" },
            body: JSON.stringify({
              name,
              mimeType: "application/vnd.google-apps.folder",
              parents: [parent],
            }),
          }),
          "creating a folder",
        )
        id = ((await res.json()) as { id: string }).id
      }
      folderIds.set(key, id)
      parent = id
    }
    return parent
  }

  return {
    async check() {
      await ok(await f(`${api}/about?fields=user`, { headers: auth }), "checking the account")
    },
    async write(folder, name, bytes, contentType) {
      const parent = await folderId([root, ...folder])
      const existing = await find(name, parent, false)
      if (existing) {
        if (existing.md5Checksum === md5(bytes)) return "exists"
        throw new WriteOnceError(`${[root, ...folder, name].join("/")}`)
      }
      // Resumable upload: one request for the metadata, one for the bytes (any size).
      const start = await ok(
        await f("https://www.googleapis.com/upload/drive/v3/files?uploadType=resumable", {
          method: "POST",
          headers: {
            ...auth,
            "content-type": "application/json; charset=UTF-8",
            "x-upload-content-type": contentType,
            "x-upload-content-length": String(bytes.byteLength),
          },
          body: JSON.stringify({ name, parents: [parent] }),
        }),
        "starting an upload",
      )
      const location = start.headers.get("location")
      if (!location) throw new DriveError("Google Drive didn't return an upload URL")
      await ok(
        await f(location, {
          method: "PUT",
          headers: { "content-type": contentType },
          body: bytes,
        }),
        "uploading",
      )
      return "written"
    },
  }
}

function oneDrive(f: Fetch, auth: Record<string, string>, root: string): DriveDestination {
  const api = "https://graph.microsoft.com/v1.0/me/drive/special/approot"
  const itemPath = (parts: string[]) => parts.map(encodeURIComponent).join("/")
  return {
    async check() {
      await ok(await f(`${api}?$select=id`, { headers: auth }), "checking the account")
    },
    async write(folder, name, bytes, contentType) {
      const path = itemPath([root, ...folder, name])
      // Folders in the path are created by the upload itself.
      const session = await f(`${api}:/${path}:/createUploadSession`, {
        method: "POST",
        headers: { ...auth, "content-type": "application/json" },
        body: JSON.stringify({ item: { "@microsoft.graph.conflictBehavior": "fail" } }),
      })
      if (session.status === 409) {
        const meta = await ok(
          await f(`${api}:/${path}?$select=size`, { headers: auth }),
          "reading the existing file",
        )
        const { size } = (await meta.json()) as { size?: number }
        if (size === bytes.byteLength) return "exists"
        throw new WriteOnceError([root, ...folder, name].join("/"))
      }
      await ok(session, "starting an upload")
      const { uploadUrl } = (await session.json()) as { uploadUrl?: string }
      if (!uploadUrl) throw new DriveError("OneDrive didn't return an upload URL")
      // One chunk: our files are at most a few tens of MB, under the 60 MiB per-request limit.
      await ok(
        await f(uploadUrl, {
          method: "PUT",
          headers: {
            "content-type": contentType,
            "content-range": `bytes 0-${bytes.byteLength - 1}/${bytes.byteLength}`,
          },
          body: bytes,
        }),
        "uploading",
      )
      return "written"
    },
  }
}
