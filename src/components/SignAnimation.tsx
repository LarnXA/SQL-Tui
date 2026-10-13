import { useEffect, useState } from "react"
import { WHALE_FRAMES } from "../views/sign"

// ===== 像素字符 -> 颜色映射（想改配色直接改这里）=====
export const PIXEL_COLORS: Record<string, string> = {
  D: "#0b1e3a", // 深蓝
  B: "#1f6feb", // 中蓝
  L: "#7DA1DE", // 浅蓝
  W: "#ffffff", // 白色
  H: "#ff9ec4", // 粉红
  Z: "#9aa6c0", // 灰色
}

// 透明像素（.）以及页面底色：保持与启动页背景一致，避免遮挡
const PAGE_BG = "#0c0c0c"

// 动画帧率（fps）。8~12 之间选一个流畅值
const FPS = 10

function colorOf(ch: string): string {
  if (ch === "." || ch === undefined) return PAGE_BG
  return PIXEL_COLORS[ch] ?? PAGE_BG
}

type Run = { fg: string; bg: string; n: number }

export function SignAnimation({ maxWidth = 0 }: { maxWidth?: number }) {
  const [frame, setFrame] = useState(0)

  useEffect(() => {
    const id = setInterval(
      () => setFrame((f) => (f + 1) % WHALE_FRAMES.length),
      1000 / FPS,
    )
    // 组件卸载（离开启动页 / 退出）时清理定时器，OpenTUI 会负责恢复终端
    return () => clearInterval(id)
  }, [])

  const current = WHALE_FRAMES[frame]
  const rows = current.rows
  const height = rows.length
  const width = rows[0]?.length ?? 0
  const outW = maxWidth > 0 ? Math.min(maxWidth, width) : width
  const termRows = Math.ceil(height / 2)

  // 预生成每一行的渲染片段
  const lineRuns: Run[][] = []
  for (let tr = 0; tr < termRows; tr++) {
    const top = rows[tr * 2] ?? ""
    const bot = rows[tr * 2 + 1] ?? ""
    const runs: Run[] = []
    for (let c = 0; c < outW; c++) {
      const fg = colorOf(top[c] ?? ".")
      const bg = colorOf(bot[c] ?? ".")
      const last = runs[runs.length - 1]
      if (last && last.fg === fg && last.bg === bg) {
        last.n++
      } else {
        runs.push({ fg, bg, n: 1 })
      }
    }
    lineRuns.push(runs)
  }

  return (
    <box
      style={{
        flexDirection: "column",
        width: outW,
        height: termRows,
        backgroundColor: PAGE_BG,
      }}
    >
      {lineRuns.map((runs, r) => (
        <box key={r} style={{ flexDirection: "row", height: 1 }}>
          {runs.map((run, i) => (
            <text
              key={i}
              style={{ fg: run.fg, backgroundColor: run.bg }}
            >
              {"▀".repeat(run.n)}
            </text>
          ))}
        </box>
      ))}
    </box>
  )
}
