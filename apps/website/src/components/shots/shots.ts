/**
 * Screenshots of the real app, in light and dark, captured on a seeded workspace by
 * `bun run --filter @sahihi/e2e showcase` (apps/e2e/showcase). Re-run it after UI changes; never
 * edit these images by hand.
 */
import type { StaticImageData } from "next/image"
import draftingDark from "@/assets/shots/drafting-dark.jpg"
import draftingLight from "@/assets/shots/drafting-light.jpg"
import editorDark from "@/assets/shots/editor-dark.jpg"
import editorLight from "@/assets/shots/editor-light.jpg"
import envelopeDark from "@/assets/shots/envelope-dark.jpg"
import envelopeLight from "@/assets/shots/envelope-light.jpg"
import filesDark from "@/assets/shots/files-dark.jpg"
import filesLight from "@/assets/shots/files-light.jpg"

export type ShotPair = { light: StaticImageData; dark: StaticImageData }

export const shots = {
  files: { light: filesLight, dark: filesDark },
  envelope: { light: envelopeLight, dark: envelopeDark },
  drafting: { light: draftingLight, dark: draftingDark },
  editor: { light: editorLight, dark: editorDark },
} satisfies Record<string, ShotPair>

export type ShotName = keyof typeof shots
