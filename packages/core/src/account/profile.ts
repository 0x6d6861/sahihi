import { z } from "zod"
import { pngDimensions } from "../shared/png"

/**
 * Settings → Profile (docs/auth.md → Account settings): the user's name, email and the signature
 * and initials they save once and reuse on signing pages addressed to their email.
 */

export const UpdateProfileSchema = z.object({
  name: z.string().trim().min(1, "Enter your name").max(80),
})
export type UpdateProfileInput = z.infer<typeof UpdateProfileSchema>

export const ChangeEmailSchema = z.object({
  newEmail: z.string().trim().toLowerCase().email("Enter a valid email address"),
})
export type ChangeEmailInput = z.infer<typeof ChangeEmailSchema>

export const SAVED_SIGNATURE_KINDS = ["signature", "initials"] as const
export type SavedSignatureKind = (typeof SAVED_SIGNATURE_KINDS)[number]

/** Same cap as a signature submitted on the signing page (`FieldValueSchema`). */
export const PngDataUrlSchema = z.string().startsWith("data:image/png;base64,").max(700_000)

export const SaveSignatureSchema = z.object({
  kind: z.enum(SAVED_SIGNATURE_KINDS),
  dataUrl: PngDataUrlSchema,
})
export type SaveSignatureInput = z.infer<typeof SaveSignatureSchema>

/**
 * Whether the signed-in user may be offered their saved signature on a signing page: only when
 * the page is addressed to them. Emails compare case-insensitively, as they're stored lowercased
 * on both sides but recipients may have been typed by hand.
 */
export function offersSavedSignature(
  userEmail: string | null | undefined,
  recipientEmail: string | null | undefined,
): boolean {
  if (!userEmail || !recipientEmail) return false
  return userEmail.trim().toLowerCase() === recipientEmail.trim().toLowerCase()
}

/**
 * Profile picture: the browser crops the chosen image to a square of this size and exports a PNG,
 * so storage only holds a small, metadata-free image.
 */
export const AVATAR_SIZE = 256
/** Upper bound for the decoded PNG (a 256×256 PNG is far smaller in practice). */
export const MAX_AVATAR_BYTES = 300 * 1024

export const AvatarSchema = z.object({ dataUrl: PngDataUrlSchema })

/** Same-origin URL stored in `User.image`; `version` changes with every upload. */
export function avatarUrl(userId: string, version: string): string {
  return `/api/avatars/${encodeURIComponent(userId)}?v=${encodeURIComponent(version)}`
}

/** Why an avatar PNG is refused, or null when it's acceptable. */
export function avatarProblem(bytes: Uint8Array): string | null {
  const size = pngDimensions(bytes)
  if (!size) return "The picture must be a PNG image"
  if (bytes.length > MAX_AVATAR_BYTES) return "The picture is too large"
  if (size.width < 1 || size.height < 1) return "The picture is empty"
  if (size.width > AVATAR_SIZE || size.height > AVATAR_SIZE)
    return `The picture must fit in ${AVATAR_SIZE}×${AVATAR_SIZE} pixels`
  return null
}
