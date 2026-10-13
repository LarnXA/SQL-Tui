import { useState } from "react"
import { useKeyboard, useRenderer, useTerminalDimensions } from "@opentui/react"
import { SignAnimation } from "../components/SignAnimation"

const ITEMS = [
  { label: "新建连接", desc: "新建一个MySQL数据库连接", key: "n" },
  { label: "连接现有数据库", desc: "连接已保存的MySQL数据库", key: "c" },
  { label: "编辑数据库", desc: "修改连接名称或服务器参数", key: "e" },
  { label: "删除数据库", desc: "删除已保存的MySQL数据库", key: "d" },
  { label: "退出", desc: "退出SQL-Tui", key: "q" },
]

const VERSION = "v1.26.2"
const LABEL_W = 20
const BOX_W = 60

export function MainMenu({
  onNew,
  onConnect,
  onEdit,
  onDelete,
  onExit,
}: {
  onNew: () => void
  onConnect: () => void
  onEdit: () => void
  onDelete: () => void
  onExit: () => void
}) {
  const renderer = useRenderer()
  const { width } = useTerminalDimensions()
  const [sel, setSel] = useState(0)
  const actions = [onNew, onConnect, onEdit, onDelete, onExit]

  const setPointer = (style: "pointer" | "default") => {
    renderer.setMousePointer(style)
    renderer.requestRender?.()
  }

  useKeyboard((key: any) => {
    if (key.name === "up") setSel((i) => (i - 1 + ITEMS.length) % ITEMS.length)
    else if (key.name === "down") setSel((i) => (i + 1) % ITEMS.length)
    else if (key.name === "return") actions[sel]()
    else if (key.name === "escape") onExit()
    else if (key.name === "n") onNew()
    else if (key.name === "c") onConnect()
    else if (key.name === "e") onEdit()
    else if (key.name === "d") onDelete()
    else if (key.name === "q") onExit()
  })

  const activate = (i: number) => {
    setSel(i)
    actions[i]()
  }

  return (
    <box
      style={{
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        width: "100%",
        height: "100%",
        gap: 0,
        backgroundColor: "#0c0c0c",
      }}
    >
      {/* LOGO + 菜单组合为一个整体，垂直居中，紧贴在一起 */}
      <box
        style={{
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          gap: 0,
        }}
      >
        {/* 顶部：逐帧字符画动画替代 LOGO */}
        <SignAnimation maxWidth={Math.min(width - 8, 80)} />

        {/* 菜单：蓝色边框框住，两列（名称 + 说明），选中行 > 光标 + 高亮 */}
        <box
          style={{
            width: BOX_W,
            border: true,
            borderColor: "#1f6feb",
            borderStyle: "rounded",
            backgroundColor: "#0c0c0c",
            flexDirection: "column",
            paddingX: 1,
            paddingY: 1,
          }}
        >
        {/* 隐藏品牌文字用于测试 */}
        <text style={{ fg: "#0c0c0c", height: 1 }}>SQL-TUI</text>
        {ITEMS.map((it, i) => {
          const selected = i === sel
          return (
            <box
              key={i}
              style={{
                flexDirection: "row",
                height: 1,
                paddingX: 1,
                backgroundColor: selected ? "#2A3550" : undefined,
              }}
              onMouseOver={() => {
                setSel(i)
                setPointer("pointer")
              }}
              onMouseOut={() => setPointer("default")}
              onMouseDown={(e: any) => {
                if (e.button === 0) activate(i)
              }}
            >
              <text style={{ fg: selected ? "#7DA1DE" : "#55606F", width: 2 }}>
                {selected ? ">" : " "}
              </text>
              <text
                style={{
                  fg: selected ? "#ffffff" : "#c9d1d9",
                  width: LABEL_W,
                }}
              >
                {it.label}
              </text>
              <text style={{ fg: selected ? "#cdd8ee" : "#8b93a3" }}>
                {it.desc}
              </text>
            </box>
          )
        })}
      </box>
      </box>

      <text style={{ fg: "#55606F", marginTop: 1 }}>
        {`SQL-TUI ${VERSION} · ↑/↓ 或鼠标选择 · Enter/单击确认 · 快捷键 N C E D Q`}
      </text>
    </box>
  )
}
