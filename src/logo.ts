import { readFileSync, existsSync } from "node:fs"
import { join } from "node:path"
import { Resvg } from "@resvg/resvg-js"

// 优先使用用户放置的透明底 PNG：src/logo.png
// 若不存在，则回退到把 src/views/single_sign.svg 栅格化为 PNG。
const PNG_PATH = join(import.meta.dir, "logo.png")
const SVG_PATH = join(import.meta.dir, "views", "single_sign.svg")

export function loadLogoPng(pixelWidth = 360): Uint8Array | null {
  try {
    if (existsSync(PNG_PATH)) {
      return new Uint8Array(readFileSync(PNG_PATH))
    }
    if (!existsSync(SVG_PATH)) return null
    const svg = readFileSync(SVG_PATH, "utf8")
    const resvg = new Resvg(svg, {
      fitTo: { mode: "width", value: pixelWidth },
    })
    const png = resvg.render().asPng()
    return new Uint8Array(png)
  } catch {
    return null
  }
}
