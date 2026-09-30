/** `import path from "./font.ttf" with { type: "file" }` resolves to a file path (Bun). */
declare module "*.ttf" {
  const path: string
  export default path
}
