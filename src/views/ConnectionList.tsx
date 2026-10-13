import { useState } from "react"
import { useKeyboard, useRenderer } from "@opentui/react"
import type { Connection } from "../types"
import { removeConnection } from "../store"
import { useTween } from "../anim"

const ROW_H = 3
const LIST_W = 62

export function ConnectionList({
  action,
  connections,
  onBack,
  onConnect,
  onEdit,
  onDeleted,
}: {
  action: "connect" | "edit" | "delete"
  connections: Connection[]
  onBack: () => void
  onConnect: (c: Connection) => void
  onEdit: (c: Connection) => void
  onDeleted: () => void
}) {
  const renderer = useRenderer()
  const [sel, setSel] = useState(0)
  const [confirm, setConfirm] = useState(false)
  const animSel = useTween(sel)
  const title =
    action === "connect" ? "连接现有数据库" : action === "edit" ? "编辑数据库" : "删除数据库"

  const setPointer = (style: "pointer" | "default") => {
    renderer.setMousePointer(style)
    renderer.requestRender?.()
  }

  useKeyboard((key: any) => {
    if (connections.length === 0) {
      if (key.name === "escape") onBack()
      return
    }
    if (confirm) {
      if (key.sequence === "y" || key.sequence === "Y") {
        removeConnection(connections[sel].id)
        onDeleted()
      } else if (key.sequence === "n" || key.sequence === "N" || key.name === "escape") {
        setConfirm(false)
      }
      return
    }
    if (key.name === "up") setSel((i) => (i - 1 + connections.length) % connections.length)
    else if (key.name === "down") setSel((i) => (i + 1) % connections.length)
    else if (key.name === "escape") onBack()
    else if (key.name === "return") {
      if (action === "connect") onConnect(connections[sel])
      else if (action === "edit") onEdit(connections[sel])
      else setConfirm(true)
    }
  })

  const activate = (i: number) => {
    setSel(i)
    if (action === "connect") onConnect(connections[i])
    else if (action === "edit") onEdit(connections[i])
    else setConfirm(true)
  }

  return (
    <box
      style={{
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        width: "100%",
        height: "100%",
        gap: 1,
      }}
    >
      <text style={{ fg: "#7DA1DE", attributes: 1 }}>{title}</text>
      <text style={{ fg: "#8b93a3" }}>
        {action === "delete"
          ? "Enter/单击 选择；y 确认删除，n 取消"
          : "↑/↓ 或鼠标选择 · Enter/单击 确认 · Esc 返回"}
      </text>
      <box style={{ height: 1 }} />

      {connections.length === 0 && (
        <text style={{ fg: "#8b93a3" }}>（暂无已保存的连接，请先新建连接）</text>
      )}

      <box style={{ position: "relative", width: LIST_W, height: ROW_H * Math.max(1, connections.length) }}>
        {connections.length > 0 && (
          <box
            style={{
              position: "absolute",
              left: 0,
              top: animSel * ROW_H,
              width: LIST_W,
              height: ROW_H,
              backgroundColor: confirm ? "#5a2a3a" : "#3B4A66",
            }}
          />
        )}
        {connections.map((c, i) => {
          const selected = i === sel
          return (
            <box
              key={c.id}
              style={{
                position: "absolute",
                left: 0,
                top: i * ROW_H,
                width: LIST_W,
                height: ROW_H,
                flexDirection: "row",
                paddingX: 1,
              }}
              onMouseOver={() => {
                setSel(i)
                setPointer("pointer")
              }}
              onMouseOut={() => setPointer("default")}
              onMouseDown={(e: any) => {
                if (e.button === 0 && !confirm) activate(i)
              }}
            >
              <text style={{ fg: selected ? "#ffffff" : "#E8E6E0", width: 24 }}>
                {selected ? "▶ " : "  "}
                {c.name}
              </text>
              <text style={{ fg: selected ? "#cdd8ee" : "#8b93a3" }}>
                {c.host}:{c.port}/{c.database}
              </text>
            </box>
          )
        })}
      </box>

      {confirm && (
        <text style={{ fg: "#E08CA8" }}>
          确认删除连接 “{connections[sel].name}” 吗？(y/n)
        </text>
      )}
    </box>
  )
}
