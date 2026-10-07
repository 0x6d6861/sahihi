/** Width and height from a PNG's IHDR chunk, or null when the bytes aren't a PNG. */
export function pngDimensions(bytes: Uint8Array): { width: number; height: number } | null {
  const signature = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]
  if (bytes.length < 24 || signature.some((b, i) => bytes[i] !== b)) return null
  // IHDR is always the first chunk: length (4) + "IHDR" (4), then width and height (big-endian).
  if (String.fromCharCode(...bytes.subarray(12, 16)) !== "IHDR") return null
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  return { width: view.getUint32(16), height: view.getUint32(20) }
}
