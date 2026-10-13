export interface TreeNode {
  key: string
  label: string
  level: number
  kind: "db" | "table" | "column"
}

function truncate(s: string, w: number): string {
  if (s.length > w) return s.slice(0, Math.max(1, w - 1)) + "…"
  return s
}

export function ProjectTree({
  nodes,
  selectedKey,
  width,
  onActivate,
  onHover,
}: {
  nodes: TreeNode[]
  selectedKey?: string
  width: number
  onActivate?: (key: string) => void
  onHover?: (key: string) => void
}) {
  return (
    <box style={{ flexDirection: "column" }}>
      {nodes.length === 0 && (
        <text style={{ fg: "#8b93a3" }}>（暂无表）</text>
      )}
      {nodes.map((n) => {
        const selected = n.key === selectedKey
        return (
          <text
            key={n.key}
            style={{
              fg: n.kind === "db" ? "#7DA1DE" : n.kind === "column" ? "#7DA1DE" : "#E8E6E0",
              bg: selected ? "#3B4A66" : "transparent",
              paddingLeft: n.level * 2,
              width,
            }}
            onMouseOver={() => onHover?.(n.key)}
            onMouseDown={(e: any) => {
              if (e.button === 0) onActivate?.(n.key)
            }}
          >
            {truncate(n.label, width)}
          </text>
        )
      })}
    </box>
  )
}
