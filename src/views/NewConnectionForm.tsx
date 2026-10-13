import { useState } from "react"
import { useKeyboard } from "@opentui/react"
import { addConnection, genId } from "../store"
import { connect } from "../db"
import type { Connection } from "../types"

const FIELDS = [
  { key: "name", label: "连接名称", def: "" },
  { key: "host", label: "主机 host", def: "127.0.0.1" },
  { key: "port", label: "端口 port", def: "3306" },
  { key: "user", label: "用户名 user", def: "" },
  { key: "password", label: "密码 password", def: "" },
  { key: "database", label: "数据库 database", def: "" },
] as const

function Field({
  label,
  value,
  focused,
  width,
  mask,
  onFocus,
}: {
  label: string
  value: string
  focused: boolean
  width: number
  mask?: boolean
  onFocus?: () => void
}) {
  const display = mask && value ? "*".repeat(value.length) : value
  return (
    <box
      style={{ flexDirection: "column", width, onMouseDown: () => onFocus?.() }}
    >
      <text style={{ fg: focused ? "#7DA1DE" : "#8b93a3" }}>{label}</text>
      <text
        style={{
          fg: "#E8E6E0",
          bg: focused ? "#3B4A66" : "#161a22",
          width,
        }}
      >
        {display || (focused ? "█" : "")}
      </text>
    </box>
  )
}

export function NewConnectionForm({
  onDone,
  onBack,
}: {
  onDone: (c: Connection) => void
  onBack: () => void
}) {
  const [values, setValues] = useState<Record<string, string>>(
    Object.fromEntries(FIELDS.map((f) => [f.key, f.def])),
  )
  const [focused, setFocused] = useState(0)
  const [error, setError] = useState("")
  const [busy, setBusy] = useState(false)

  useKeyboard((key: any) => {
    if (key.name === "escape") {
      onBack()
      return
    }
    if (busy) return
    if (key.name === "tab") {
      setFocused((f) => (f + 1) % FIELDS.length)
      return
    }
    const keyName = FIELDS[focused].key
    if (key.name === "return") {
      submit()
      return
    }
    if (key.name === "backspace") {
      setValues((v) => ({ ...v, [keyName]: v[keyName].slice(0, -1) }))
      return
    }
    if (key.ctrl) return
    const ch = key.sequence
    if (ch && ch.length === 1 && ch >= " ") {
      setValues((v) => ({ ...v, [keyName]: v[keyName] + ch }))
    }
  })

  async function submit() {
    setError("")
    if (!values.name.trim()) {
      setError("连接名称不能为空")
      return
    }
    if (!values.host.trim()) {
      setError("主机不能为空")
      return
    }
    const port = parseInt(values.port, 10)
    if (!port || port <= 0 || port > 65535) {
      setError("端口无效")
      return
    }
    const cfg = {
      host: values.host.trim(),
      port,
      user: values.user.trim(),
      password: values.password,
      database: values.database.trim(),
    }
    setBusy(true)
    try {
      const pool = await connect(cfg)
      await pool.end()
    } catch (e: any) {
      setBusy(false)
      setError(`连接失败: ${e?.message ?? e}`)
      return
    }
    const conn: Connection = {
      id: genId(),
      name: values.name.trim(),
      type: "mysql",
      host: cfg.host,
      port: cfg.port,
      user: cfg.user,
      password: cfg.password,
      database: cfg.database,
    }
    addConnection(conn)
    onDone(conn)
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
      <text style={{ fg: "#7DA1DE", attributes: 1 }}>新建 MySQL 连接</text>
      <text style={{ fg: "#8b93a3" }}>
        Tab/单击 切换字段 · Enter 测试并保存 · Esc 返回
      </text>
      <box style={{ height: 1 }} />
      {FIELDS.map((f, i) => (
        <Field
          key={f.key}
          label={f.label}
          value={values[f.key]}
          focused={i === focused}
          width={50}
          mask={f.key === "password"}
          onFocus={() => setFocused(i)}
        />
      ))}
      {error && <text style={{ fg: "#E08CA8" }}>{error}</text>}
      {busy && <text style={{ fg: "#ffd479" }}>正在连接…</text>}
    </box>
  )
}
