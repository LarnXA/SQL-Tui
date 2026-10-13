import type { QueryResult } from "../db"

const WIDE_RE =
  /[\u1100-\u115f\u2e80-\ua4cf\uac00-\ud7ff\u3040-\u309f\u30a0-\u30ff\u3000-\u303f\uff00-\uffef]/

function displayWidth(s: string): number {
  let w = 0
  for (const ch of s) {
    w += WIDE_RE.test(ch) ? 2 : 1
  }
  return w
}

function truncateByWidth(s: string, w: number): string {
  if (w <= 0) return ""
  let acc = 0
  let i = 0
  for (const ch of s) {
    const cw = WIDE_RE.test(ch) ? 2 : 1
    if (acc + cw > w) break
    acc += cw
    i += ch.length
  }
  if (i < s.length && w >= 1) {
    // 用省略号替换超出部分，省略号占 1 个显示宽度
    return s.slice(0, Math.max(0, i - 1)) + "…"
  }
  return s.slice(0, i)
}

function padByWidth(s: any, w: number): string {
  s = s === null || s === undefined ? "NULL" : String(s)
  const sw = displayWidth(s)
  if (sw > w) return truncateByWidth(s, w)
  const total = w - sw
  const left = Math.floor(total / 2)
  const right = total - left
  return " ".repeat(left) + s + " ".repeat(right)
}

export function SqlTable({
  result,
  width,
  height,
  scroll,
}: {
  result: QueryResult | null
  width: number
  height: number
  scroll: number
}) {
  if (!result || result.columns.length === 0) {
    return (
      <text style={{ fg: "#8b93a3" }}>
        无数据。在下方输入 SQL 语句后按 Ctrl+Enter 执行；或在左侧选择表查看。
      </text>
    )
  }

  const { columns, rows } = result
  const sep = 3 // " | "

  // 基于内容计算每列显示宽度
  let widths = columns.map((c, i) => {
    let w = displayWidth(String(c))
    for (const r of rows) {
      const v = r[i] === null || r[i] === undefined ? "NULL" : String(r[i])
      const vw = displayWidth(v)
      if (vw > w) w = vw
    }
    return w
  })

  const total = widths.reduce((a, b) => a + b, 0) + Math.max(0, columns.length - 1) * sep

  // 如果总宽度不足可用空间，把剩余空间均分给各列，让表格铺满面板
  if (total < width) {
    const extra = width - total
    const n = widths.length || 1
    const base = Math.floor(extra / n)
    let remainder = extra % n
    widths = widths.map((w) => w + base + (remainder-- > 0 ? 1 : 0))
  } else if (total > width) {
    // 过宽时逐列缩减，优先从大列开始
    let deficit = total - width
    let safety = 0
    while (deficit > 0 && safety++ < 1000) {
      const maxIdx = widths.indexOf(Math.max(...widths))
      if (widths[maxIdx] <= 1) break
      widths[maxIdx]--
      deficit--
    }
  }

  const line = (cells: any[]) =>
    cells.map((c, i) => padByWidth(c, widths[i])).join(" | ")

  const lines: any[] = []
  lines.push(<text key="h" style={{ fg: "#7DA1DE", attributes: 1 }}>{line(columns)}</text>)
  lines.push(
    <text key="s" style={{ fg: "#55606F" }}>
      {widths.map((w) => "-".repeat(w)).join("-+-")}
    </text>,
  )

  const maxRows = Math.max(0, height - 2)
  const start = Math.max(0, Math.min(scroll, rows.length))
  const visible = rows.slice(start, start + maxRows)
  visible.forEach((r, idx) => {
    const actual = start + idx
    lines.push(
      <text key={`r${actual}`} style={{ fg: actual % 2 ? "#cfd6e2" : "#E8E6E0" }}>
        {line(r)}
      </text>,
    )
  })

  if (rows.length > start + visible.length) {
    lines.push(
      <text key="more" style={{ fg: "#8b93a3" }}>
        … 还有 {rows.length - (start + visible.length)} 行（PageUp/PageDown 翻页）
      </text>,
    )
  }

  return <box style={{ flexDirection: "column" }}>{lines}</box>
}
