/** `import path from "./font.ttf" with { type: "file" }` resolves to a file path (Bun). */
declare module "*.ttf" {
  const path: string
  export default path
}

/** `import path from "…/pdfium.wasm" with { type: "file" }` resolves to a file path (Bun). */
declare module "*.wasm" {
  const path: string
  export default path
}
