import type { Suggestion } from "../commands"

export function Suggestions({
  items,
  index,
  onHover,
  onClick,
  onScroll,
  width,
  height,
  left,
  bottom,
}: {
  items: Suggestion[]
  index: number
  onHover: (i: number) => void
  onClick: (i: number) => void
  onScroll: (dir: number) => void
  width: number
  height: number
  left: number
  bottom: number
}) {
  const visible = items.slice(0, height - 2)
  return (
    <box
      style={{
        position: "absolute",
        left,
        bottom,
        flexDirection: "column",
        border: true,
        borderColor: "#7DA1DE",
        backgroundColor: "#10141d",
        paddingX: 1,
        paddingY: 1,
      }}
      onMouseScroll={(e: any) => {
        const d = e?.scroll?.direction
        const dir = typeof d === "number" ? (d > 0 ? 1 : -1) : d === "down" || d === "right" ? 1 : -1
        onScroll(dir)
      }}
    >
      <text style={{ fg: "#7DA1DE" }}>
        {"补全  ↑/↓ 或滚轮选择 · Tab / 单击确认"}
      </text>
      {visible.map((s, i) => {
        const sel = i === index
        return (
          <box
            key={i}
            style={{
              flexDirection: "row",
              backgroundColor: sel ? "#3B4A66" : "transparent",
              paddingX: 1,
            }}
            onMouseOver={() => onHover(i)}
            onMouseDown={(e: any) => {
              if (e.button === 0) onClick(i)
            }}
          >
            <text style={{ fg: sel ? "#ffffff" : "#cdd8ee", width: Math.floor(width * 0.45) }}>
              {(sel ? "▶ " : "  ") + s.label}
            </text>
            <text style={{ fg: sel ? "#d6e2f5" : "#8b93a3" }}>{s.zh ?? ""}</text>
          </box>
        )
      })}
    </box>
  )
}
