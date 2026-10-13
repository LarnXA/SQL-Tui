import { useEffect, useMemo, useRef, useState } from "react"
import {
  useKeyboard,
  usePaste,
  useTerminalDimensions,
} from "@opentui/react"
import { decodePasteBytes } from "@opentui/core"
import { ProjectTree, type TreeNode } from "../components/ProjectTree"
import { SqlTable } from "../components/SqlTable"
import { Suggestions } from "../components/Suggestions"
import { computeSuggestions } from "../commands"
import { useBlink } from "../anim"
import { readClipboard, writeClipboard } from "../clipboard"
import {
  connect,
  listTables,
  listColumns,
  rowCount,
  runQuery,
  type Pool,
  type QueryResult,
} from "../db"
import type { Connection } from "../types"

const CMD_LINES = 4 // 命令行可见行数

export function Workspace({
  connection,
  onExit,
}: {
  connection: Connection
  onExit: () => void
}) {
  const { width, height } = useTerminalDimensions()

  const [pool, setPool] = useState<Pool | null>(null)
  const [connState, setConnState] = useState<"connecting" | "ready" | "error">(
    "connecting",
  )
  const [connError, setConnError] = useState("")
  const poolRef = useRef<Pool | null>(null)

  const [tables, setTables] = useState<{ name: string; count: number }[]>([])
  const [columnsCache, setColumnsCache] = useState<Record<string, string[]>>({})
  const [expanded, setExpanded] = useState<Set<string>>(new Set())
  const [selIndex, setSelIndex] = useState(0)
  const [currentTable, setCurrentTable] = useState<string | null>(null)
  const [result, setResult] = useState<QueryResult | null>(null)
  const [status, setStatus] = useState("连接中…")
  const [resScroll, setResScroll] = useState(0)
  const [currentDb, setCurrentDb] = useState(connection.database)

  // ===== 命令行编辑器状态 =====
  const [commandFocused, setCommandFocused] = useState(false)
  const [command, setCommand] = useState("")
  const [cursor, setCursor] = useState(0)
  const [selAnchor, setSelAnchor] = useState<number | null>(null)
  const [history, setHistory] = useState<string[]>([])
  const [histIndex, setHistIndex] = useState(0)
  const [undoStack, setUndoStack] = useState<{ cmd: string; cur: number }[]>([])
  const [suggestIndex, setSuggestIndex] = useState(0)
  const [pendingExecute, setPendingExecute] = useState(false)
  const blink = useBlink()

  // ref 镜像：键盘回调里始终读到最新值
  const commandRef = useRef("")
  const cursorRef = useRef(0)
  const selRef = useRef<number | null>(null)
  const historyRef = useRef<string[]>([])
  const undoRef = useRef<{ cmd: string; cur: number }[]>([])
  commandRef.current = command
  cursorRef.current = cursor
  selRef.current = selAnchor

  const suggestions = useMemo(
    () => computeSuggestions(command, tables),
    [command, tables],
  )
  // 补全框：仅在输入了 "/" 时才弹出
  const showSuggest =
    commandFocused && command.includes("/") && suggestions.length > 0

  useEffect(() => {
    setSuggestIndex(0)
  }, [command])

  // ===== 编辑器基础操作 =====
  function pushUndo() {
    const s = [
      ...undoRef.current.slice(-99),
      { cmd: commandRef.current, cur: cursorRef.current },
    ]
    undoRef.current = s
    setUndoStack(s)
  }

  function commit(
    next: string,
    nextCursor: number,
    nextSel: number | null = null,
    undo = true,
  ) {
    if (undo) pushUndo()
    commandRef.current = next
    cursorRef.current = nextCursor
    selRef.current = nextSel
    setCommand(next)
    setCursor(nextCursor)
    setSelAnchor(nextSel)
    setPendingExecute(false)
  }

  function selRange(): [number, number] | null {
    if (selRef.current == null) return null
    const a = selRef.current
    const b = cursorRef.current
    return a === b ? null : [Math.min(a, b), Math.max(a, b)]
  }

  function deleteSelection(): boolean {
    const r = selRange()
    if (!r) return false
    const cmd = commandRef.current
    commit(cmd.slice(0, r[0]) + cmd.slice(r[1]), r[0], null)
    return true
  }

  function insertText(t: string) {
    if (!t) return
    const cmd = commandRef.current
    const r = selRange()
    if (r) {
      const next = cmd.slice(0, r[0]) + t + cmd.slice(r[1])
      commit(next, r[0] + t.length, null)
    } else {
      const c = cursorRef.current
      const next = cmd.slice(0, c) + t + cmd.slice(c)
      commit(next, c + t.length, null)
    }
  }

  function moveCursor(pos: number, extend = false) {
    const p = Math.max(0, Math.min(commandRef.current.length, pos))
    if (extend && selRef.current == null) selRef.current = cursorRef.current
    cursorRef.current = p
    setCursor(p)
    setSelAnchor(extend ? selRef.current : null)
  }

  function wordLeft() {
    const s = commandRef.current
    let i = cursorRef.current
    while (i > 0 && /\s/.test(s[i - 1])) i--
    while (i > 0 && !/\s/.test(s[i - 1])) i--
    moveCursor(i)
  }

  function wordRight() {
    const s = commandRef.current
    let i = cursorRef.current
    while (i < s.length && /\s/.test(s[i])) i++
    while (i < s.length && !/\s/.test(s[i])) i++
    moveCursor(i)
  }

  function pushHistory(cmd: string) {
    const t = cmd.trim()
    if (!t) return
    const h = historyRef.current
    const next = h[h.length - 1] === t ? h : [...h.slice(-199), t]
    historyRef.current = next
    setHistory(next)
    setHistIndex(next.length)
  }

  function historyPrev() {
    const h = historyRef.current
    if (h.length === 0) return
    const idx = histIndex <= 0 ? 0 : histIndex - 1
    setHistIndex(idx)
    commit(h[idx], h[idx].length, null, false)
  }

  function historyNext() {
    const h = historyRef.current
    if (histIndex >= h.length) return
    const idx = histIndex + 1
    setHistIndex(idx)
    const cmd = idx >= h.length ? "" : h[idx]
    commit(cmd, cmd.length, null, false)
  }

  function undo() {
    const s = undoRef.current
    if (s.length === 0) {
      setStatus("没有可撤销的操作")
      return
    }
    const last = s[s.length - 1]
    const ns = s.slice(0, -1)
    undoRef.current = ns
    setUndoStack(ns)
    commandRef.current = last.cmd
    cursorRef.current = last.cur
    selRef.current = null
    setCommand(last.cmd)
    setCursor(last.cur)
    setSelAnchor(null)
  }

  function copySelection() {
    const r = selRange()
    const t = r ? commandRef.current.slice(r[0], r[1]) : ""
    if (t) {
      void writeClipboard(t)
      setStatus(`已复制 ${t.length} 个字符到剪贴板`)
    } else {
      setStatus("没有选中内容（Ctrl+A 全选）")
    }
  }

  function pasteClipboard() {
    void readClipboard().then((t) => {
      if (t) insertText(t)
    })
  }

  function selectAll() {
    const len = commandRef.current.length
    selRef.current = 0
    cursorRef.current = len
    setSelAnchor(0)
    setCursor(len)
    setStatus(`已全选 ${len} 个字符`)
  }

  function getLineInfo(s: string, pos: number) {
    const lines = s.split("\n")
    const starts: number[] = []
    let acc = 0
    for (const l of lines) {
      starts.push(acc)
      acc += l.length + 1
    }
    const idx = starts.findLastIndex((st) => pos >= st)
    const safeIdx = idx < 0 ? 0 : idx
    return { lines, starts, idx: safeIdx, col: pos - starts[safeIdx] }
  }

  // ===== 连接 =====
  useEffect(() => {
    let cancelled = false
    setConnState("connecting")
    setStatus("连接中…")
    connect({
      host: connection.host,
      port: connection.port,
      user: connection.user,
      password: connection.password,
      database: connection.database,
    })
      .then(async (p) => {
        if (cancelled) {
          p.end()
          return
        }
        poolRef.current = p
        setPool(p)
        setConnState("ready")
        // 解析当前默认数据库（连接配置里可能为空）
        let db = connection.database ?? ""
        try {
          const [rows] = await p.query("SELECT DATABASE() AS db")
          db = (rows as any[])[0]?.db ?? db
          if (db) setCurrentDb(db)
        } catch {
          /* 忽略 */
        }
        if (!db) {
          setStatus(
            `已连接 ${connection.name}，但未指定默认数据库；请在连接配置中填写默认库，或执行 USE 数据库;`,
          )
        } else {
          setStatus(
            `已连接: ${connection.name} (${connection.host}:${connection.port})`,
          )
        }
      })
      .catch((e: any) => {
        if (cancelled) return
        setConnState("error")
        setConnError(e?.message ?? String(e))
        setStatus(`连接失败: ${e?.message ?? e}`)
      })
    return () => {
      cancelled = true
      poolRef.current?.end().catch(() => {})
      poolRef.current = null
    }
  }, [connection])

  // ===== 加载表列表 =====
  useEffect(() => {
    if (!pool || !currentDb) return
    let cancelled = false
    listTables(pool, currentDb)
      .then(async (names) => {
        const withCount = await Promise.all(
          names.map(async (name) => ({
            name,
            count: await rowCount(pool, currentDb, name),
          })),
        )
        if (!cancelled) setTables(withCount)
      })
      .catch((e: any) => {
        if (!cancelled) setStatus(`加载表列表失败: ${e?.message ?? e}`)
      })
    return () => {
      cancelled = true
    }
  }, [pool, currentDb])

  // 重新加载表列表（执行后自动调用 / R 手动调用）
  function refreshTables() {
    const p = poolRef.current
    if (!p || !currentDb) return
    listTables(p, currentDb)
      .then(async (names) => {
        const withCount = await Promise.all(
          names.map(async (name) => ({
            name,
            count: await rowCount(p, currentDb, name),
          })),
        )
        setTables(withCount)
      })
      .catch((e: any) => setStatus(`刷新表列表失败: ${e?.message ?? e}`))
  }

  const nodes: TreeNode[] = useMemo(() => {
    const arr: TreeNode[] = []
    arr.push({ key: "__db", label: `🗄 ${connection.name}`, level: 0, kind: "db" })
    for (const t of tables) {
      const isExp = expanded.has(t.name)
      arr.push({
        key: `t:${t.name}`,
        label: `${isExp ? "▾" : "▸"} ${t.name}  (${t.count})`,
        level: 1,
        kind: "table",
        table: t.name,
      })
      if (isExp) {
        for (const col of columnsCache[t.name] ?? []) {
          arr.push({
            key: `c:${t.name}:${col}`,
            label: `  • ${col}`,
            level: 2,
            kind: "column",
          })
        }
      }
    }
    return arr
  }, [tables, expanded, columnsCache, connection.name])

  const selIndexRef = useRef(0)
  const nodesRef = useRef<TreeNode[]>([])
  selIndexRef.current = selIndex
  nodesRef.current = nodes

  const idxOf = (k: string) => nodes.findIndex((n) => n.key === k)
  const hoverKey = (k: string) => {
    const i = idxOf(k)
    if (i >= 0) setSelIndex(i)
  }
  const activateKey = (k: string) => {
    const i = idxOf(k)
    if (i >= 0) {
      setSelIndex(i)
      activateNode(i)
    }
  }

  function execute(sql: string, clearAfter = false) {
    const text = sql.trim()
    if (!text) return

    // ===== 斜杠命令（不发给 MySQL，未连接也可用）=====
    if (text.startsWith("/")) {
      const head = text.split(/\s+/)[0].toLowerCase()
      pushHistory(text)
      if (clearAfter) commit("", 0, null, false)
      if (head === "/quit" || head === "/exit" || head === "/q") {
        onExit()
        return
      }
      if (head === "/clear") {
        setResult(null)
        setStatus("已清空结果区")
        return
      }
      if (head === "/tables") {
        refreshTables()
        setStatus("已刷新项目树")
        return
      }
      if (head === "/help") {
        setStatus("斜杠命令: /quit 退出 · /clear 清空结果 · /tables 刷新树")
        return
      }
      setStatus(`未知命令: ${text}（/help 查看可用命令）`)
      return
    }

    const p = poolRef.current
    // 命令先入历史，再执行（即使未连接也可用 ↑ 召回）
    pushHistory(text)
    if (!p) {
      setStatus("未连接数据库")
      if (clearAfter) commit("", 0, null, false)
      return
    }

    setStatus("执行中…")
    runQuery(p, text, currentDb)
      .then((res) => {
        setResult(res)
        setResScroll(0)
        let statusMsg = res.message
        if (!statusMsg) {
          if (res.columns.length === 0 && res.rows.length === 0) {
            statusMsg = `执行成功: ${res.affectedRows ?? 0} 行受影响`
          } else {
            statusMsg = `查询成功: ${res.columns.length} 列, ${res.rows.length} 行`
          }
        }
        setStatus(statusMsg)
        // USE <db> 成功后切换当前库，项目树跟随刷新
        const m = text.match(/^use\s+`?([\w$]+)`?\s*;?$/i)
        if (m) {
          setCurrentDb(m[1])
          setStatus(`已切换到数据库 ${m[1]}`)
        } else {
          refreshTables()
        }
      })
      .catch((e: any) => {
        setResult(null)
        setStatus(`错误: ${e?.message ?? String(e)}`)
      })
      .finally(() => {
        if (clearAfter) commit("", 0, null, false)
      })
  }

  function activateNode(i: number) {
    const node = nodes[i]
    if (!node) return
    if (node.kind === "table" && node.table) {
      const tbl = node.table
      if (!currentDb) {
        setStatus("请先选择数据库（在连接配置中填写默认库，或执行 USE 数据库;）")
        return
      }
      setCurrentTable(tbl)
      const sql = `SELECT * FROM \`${currentDb}\`.\`${tbl}\``
      execute(sql)
    } else if (node.kind === "db") {
      if (!currentDb) {
        setStatus("请先选择数据库（在连接配置中填写默认库，或执行 USE 数据库;）")
        return
      }
      const sql = `SELECT table_name, table_type FROM information_schema.tables WHERE table_schema = '${currentDb}' ORDER BY table_name`
      execute(sql)
    }
  }

  function onEnter() {
    activateNode(selIndexRef.current)
  }

  function acceptSuggestion(i: number) {
    const s = suggestions[i]
    if (!s) return
    commit(s.insert, s.insert.length, null, false)
    setSuggestIndex(0)
    setPendingExecute(true)
  }

  function toggleExpand(expand: boolean) {
    const node = nodesRef.current[selIndexRef.current]
    if (node?.kind === "table" && node.table) {
      const tbl = node.table
      setExpanded((prev) => {
        const s = new Set(prev)
        if (expand) s.add(tbl)
        else s.delete(tbl)
        return s
      })
      if (expand && !columnsCache[tbl] && pool) {
        listColumns(pool, currentDb, tbl)
          .then((cols) =>
            setColumnsCache((c) => ({ ...c, [tbl]: cols })),
          )
          .catch(() => {})
      }
    }
  }

  function focusCommand() {
    setCommandFocused(true)
    moveCursor(commandRef.current.length)
  }

  useKeyboard((key: any) => {
    // ===== 命令行聚焦中 =====
    if (commandFocused) {
      // Ctrl 组合键
      if (key.ctrl) {
        if (key.name === "return") {
          execute(commandRef.current, true)
          setPendingExecute(false)
          return
        }
        if (key.name === "c") {
          copySelection()
          return
        }
        if (key.name === "v") {
          pasteClipboard()
          return
        }
        if (key.name === "a") {
          selectAll()
          return
        }
        if (key.name === "z") {
          undo()
          return
        }
        if (key.name === "left") {
          wordLeft()
          return
        }
        if (key.name === "right") {
          wordRight()
          return
        }
        return // 其它 Ctrl 组合一律忽略
      }

      if (key.name === "escape") {
        setCommandFocused(false)
        setPendingExecute(false)
        return
      }

      if (key.name === "return") {
        const s = showSuggest ? suggestions[suggestIndex] : null
        const first = s ? s.insert.trim().split(/\s+/)[0] : ""
        const typed = commandRef.current.trim()
        // 只有当当前输入仍是高亮项首词的“严格前缀”时才补齐；否则按换行/执行处理
        const shouldComplete =
          showSuggest &&
          !pendingExecute &&
          first.length > typed.length &&
          first.toLowerCase().startsWith(typed.toLowerCase())
        if (shouldComplete) {
          acceptSuggestion(suggestIndex)
          return
        }
        // MySQL 风格：以分号结尾才执行，否则换行继续输入
        const text = commandRef.current.trimEnd()
        if (!text) return
        if (text.endsWith(";")) {
          execute(commandRef.current, true)
          setPendingExecute(false)
        } else {
          insertText("\n")
        }
        return
      }

      if (key.name === "tab") {
        if (showSuggest) acceptSuggestion(suggestIndex)
        return
      }

      if (showSuggest) {
        if (key.name === "up") {
          setSuggestIndex((i) => (i - 1 + suggestions.length) % suggestions.length)
          return
        }
        if (key.name === "down") {
          setSuggestIndex((i) => (i + 1) % suggestions.length)
          return
        }
      } else {
        // 多行编辑时，上/下在逻辑行之间移动；到边界时翻阅历史命令
        if (key.name === "up") {
          const { lines, starts, idx, col } = getLineInfo(
            commandRef.current,
            cursorRef.current,
          )
          if (idx > 0) {
            moveCursor(starts[idx - 1] + Math.min(col, lines[idx - 1].length))
          } else {
            historyPrev()
          }
          return
        }
        if (key.name === "down") {
          const { lines, starts, idx, col } = getLineInfo(
            commandRef.current,
            cursorRef.current,
          )
          if (idx < lines.length - 1) {
            moveCursor(starts[idx + 1] + Math.min(col, lines[idx + 1].length))
          } else {
            historyNext()
          }
          return
        }
      }

      // Shift + 左右：扩展选区
      if (key.shift && (key.name === "left" || key.name === "right")) {
        if (key.name === "left") moveCursor(cursorRef.current - 1, true)
        else moveCursor(cursorRef.current + 1, true)
        return
      }

      if (key.name === "left") {
        const r = selRange()
        moveCursor(r ? r[0] : cursorRef.current - 1)
        return
      }
      if (key.name === "right") {
        const r = selRange()
        moveCursor(r ? r[1] : cursorRef.current + 1)
        return
      }
      if (key.name === "home") {
        const { starts, idx } = getLineInfo(commandRef.current, cursorRef.current)
        moveCursor(starts[idx])
        return
      }
      if (key.name === "end") {
        const { lines, starts, idx } = getLineInfo(
          commandRef.current,
          cursorRef.current,
        )
        moveCursor(starts[idx] + lines[idx].length)
        return
      }
      if (key.name === "backspace") {
        if (!deleteSelection()) {
          const c = cursorRef.current
          if (c > 0) {
            commit(
              commandRef.current.slice(0, c - 1) + commandRef.current.slice(c),
              c - 1,
              null,
            )
          }
        }
        return
      }
      if (key.name === "delete") {
        if (!deleteSelection()) {
          const c = cursorRef.current
          if (c < commandRef.current.length) {
            commit(
              commandRef.current.slice(0, c) + commandRef.current.slice(c + 1),
              c,
              null,
            )
          }
        }
        return
      }

      const ch = key.sequence
      if (ch && ch.length === 1 && ch >= " ") insertText(ch)
      return
    }

    // ===== 未聚焦：树导航 =====
    if (key.name === "escape") {
      onExit()
      return
    }
    if (key.name === "up") setSelIndex((i) => Math.max(0, i - 1))
    else if (key.name === "down")
      setSelIndex((i) => Math.min(nodes.length - 1, i + 1))
    else if (key.name === "right") toggleExpand(true)
    else if (key.name === "left") toggleExpand(false)
    else if (key.name === "return") onEnter()
    else if (key.name === "pageup") setResScroll((s) => Math.max(0, s - 10))
    else if (key.name === "pagedown") setResScroll((s) => s + 10)
    else if (key.sequence === ":") focusCommand()
    else if (key.name === "i") focusCommand()
    else if (key.name === "r") {
      refreshTables()
      setStatus("已刷新项目树")
    }
  })

  usePaste((event: any) => {
    const text = decodePasteBytes(event.bytes)
    if (!text) return
    // 统一换行符并保留多行，确保粘贴的分行文本能正确显示为续行
    const normalized = text.replace(/\r\n/g, "\n").replace(/\r/g, "\n")
    if (!commandFocused) setCommandFocused(true)
    insertText(normalized)
  })

  // 滚轮方向工具：direction 是 "up"/"down"/"left"/"right" 字符串
  const scrollDir = (e: any) => {
    const d = e?.scroll?.direction
    if (typeof d === "number") return d > 0 ? 1 : -1
    if (d === "down" || d === "right") return 1
    return -1
  }

  // 左侧树可见范围
  const treeVisible = Math.max(1, height - 1 - 6 - 2)
  const treeStart = Math.min(
    Math.max(0, selIndex - treeVisible + 1),
    Math.max(0, nodes.length - treeVisible),
  )
  const visibleNodes = nodes.slice(treeStart, treeStart + treeVisible)

  const treeWidth = Math.max(20, 30 - 4)
  const resWidth = Math.max(20, width - 30 - 4)
  const resHeight = Math.max(5, height - 1 - 6 - 5)

  // ===== 命令行渲染（带光标与选区）=====
  const promptW = 7
  const cmdInnerW = Math.max(10, width - 4)
  const maxTextW = Math.max(10, cmdInnerW - promptW)
  const promptFirst = "mysql> "
  const promptCont = "    -> "

  const cmdLines = command.split("\n")
  const lineStarts: number[] = []
  {
    let acc = 0
    for (const l of cmdLines) {
      lineStarts.push(acc)
      acc += l.length + 1
    }
  }

  type CmdRow = {
    lineIndex: number
    chunkStart: number
    text: string
    prompt: string
    globalStart: number
  }
  const rows: CmdRow[] = []
  cmdLines.forEach((line, li) => {
    if (line.length === 0) {
      rows.push({
        lineIndex: li,
        chunkStart: 0,
        text: "",
        prompt: li === 0 ? promptFirst : promptCont,
        globalStart: lineStarts[li],
      })
      return
    }
    for (let i = 0; i < line.length; i += maxTextW) {
      const chunk = line.slice(i, i + maxTextW)
      const prompt = i === 0 ? (li === 0 ? promptFirst : promptCont) : promptCont
      rows.push({
        lineIndex: li,
        chunkStart: i,
        text: chunk,
        prompt,
        globalStart: lineStarts[li] + i,
      })
    }
  })
  if (rows.length === 0) {
    rows.push({
      lineIndex: 0,
      chunkStart: 0,
      text: "",
      prompt: promptFirst,
      globalStart: 0,
    })
  }

  const sel = selRange()
  const showCursor = commandFocused && !sel
  let cursorRow = 0
  for (let i = 0; i < rows.length; i++) {
    const r = rows[i]
    if (cursor >= r.globalStart && cursor <= r.globalStart + r.text.length) {
      cursorRow = i
      break
    }
  }
  const startRow = Math.max(0, cursorRow - (CMD_LINES - 1))
  const visibleRows = rows.slice(startRow, startRow + CMD_LINES)

  function renderRow(row: CmdRow): { t: string; sel: boolean }[] {
    const text = row.text
    const globalStart = row.globalStart
    const parts: { t: string; sel: boolean }[] = []
    const selFrom = sel ? Math.max(sel[0], globalStart) : -1
    const selTo = sel ? Math.min(sel[1], globalStart + text.length) : -1
    const hasSel = selTo > selFrom
    const cursorInRow =
      showCursor && cursor >= globalStart && cursor <= globalStart + text.length
    let cur = ""
    let curSel = false
    const flush = () => {
      if (cur) parts.push({ t: cur, sel: curSel })
      cur = ""
    }
    for (let idx = 0; idx <= text.length; idx++) {
      const isSel =
        hasSel && idx >= selFrom - globalStart && idx < selTo - globalStart
      if (isSel !== curSel) {
        flush()
        curSel = isSel
      }
      if (cursorInRow && idx === cursor - globalStart) {
        flush()
        parts.push({ t: blink ? "█" : " ", sel: curSel })
      }
      if (idx === text.length) break
      cur += text[idx]
    }
    flush()
    return parts
  }

  return (
    <box style={{ flexDirection: "column", width: "100%", height: "100%" }}>
      {/* 顶部标题栏 */}
      <box
        style={{
          height: 1,
          backgroundColor: "#1f6feb",
          paddingX: 1,
          flexDirection: "row",
          justifyContent: "space-between",
        }}
      >
        <text style={{ fg: "#ffffff", attributes: 1 }}>SQL-TUI · MySQL 客户端</text>
        <text style={{ fg: "#dbe7ff" }}>
          {connection.name} · {connection.host}:{connection.port}/{currentDb}
        </text>
      </box>

      <box style={{ flexDirection: "row", flexGrow: 1, minHeight: 0 }}>
        <box
          style={{
            width: 30,
            border: true,
            borderColor: "#55606F",
            borderStyle: "rounded",
            title: "项目树",
            flexDirection: "column",
            paddingX: 1,
            paddingY: 1,
            minHeight: 0,
            overflow: "hidden",
            onMouseScroll: (e: any) =>
              setSelIndex((i) =>
                Math.max(0, Math.min(nodes.length - 1, i + scrollDir(e))),
              ),
          }}
        >
          {connState !== "ready" ? (
            <text style={{ fg: connState === "error" ? "#E08CA8" : "#ffd479" }}>
              {connState === "error"
                ? `连接失败: ${connError}（Esc 返回）`
                : "连接中…"}
            </text>
          ) : (
            <ProjectTree
              nodes={visibleNodes}
              selectedKey={nodes[selIndex]?.key}
              width={treeWidth}
              onActivate={activateKey}
              onHover={hoverKey}
            />
          )}
        </box>

        <box
          style={{
            flexGrow: 1,
            border: true,
            borderColor: "#55606F",
            borderStyle: "rounded",
            title: `查询结果${currentTable ? " · " + currentTable : ""}`,
            flexDirection: "column",
            paddingX: 1,
            paddingY: 1,
            minWidth: 0,
            minHeight: 0,
            overflow: "hidden",
            onMouseScroll: (e: any) =>
              setResScroll((s) => Math.max(0, s + scrollDir(e) * 3)),
          }}
        >
          <text style={{ fg: "#9aa6c0", marginBottom: 1 }}>{status}</text>
          {connState === "ready" && (
            <SqlTable
              result={result}
              width={resWidth}
              height={resHeight}
              scroll={resScroll}
            />
          )}
        </box>
      </box>

      {/* 底部多行命令输入 */}
      <box
        style={{
          height: 6,
          border: true,
          borderColor: commandFocused ? "#7DA1DE" : "#55606F",
          borderStyle: "rounded",
          title:
            "SQL 命令  ( ; 结尾执行 · Enter 换行 · ↑↓ 历史 · Ctrl+C/V/A/Z · /quit )",
          paddingX: 1,
          paddingY: 1,
          flexDirection: "column",
        }}
      >
        {command === "" && !commandFocused ? (
          <box style={{ flexDirection: "row", height: 1 }}>
            <text style={{ fg: "#7DA1DE", width: promptW }}>{promptFirst}</text>
            <text style={{ fg: "#8b93a3" }}>
              输入 SQL，以 ; 结尾执行；输入 / 弹出补全；/quit 退出
            </text>
          </box>
        ) : (
          visibleRows.map((row) => {
            const parts = renderRow(row)
            return (
              <box
                key={`${row.lineIndex}-${row.chunkStart}`}
                style={{ flexDirection: "row", height: 1 }}
              >
                <text style={{ fg: "#7DA1DE", width: promptW }}>{row.prompt}</text>
                {parts.map((p, j) => (
                  <text
                    key={j}
                    style={{
                      fg: "#e6edf3",
                      backgroundColor: p.sel ? "#2A3550" : undefined,
                    }}
                  >
                    {p.t}
                  </text>
                ))}
              </box>
            )
          })
        )}
      </box>

      {/* 自动补全窗口 */}
      {showSuggest && (
        <Suggestions
          items={suggestions}
          index={suggestIndex}
          onHover={setSuggestIndex}
          onClick={acceptSuggestion}
          onScroll={(dir: number) =>
            setSuggestIndex((i) =>
              Math.max(0, Math.min(suggestions.length - 1, i + dir)),
            )
          }
          width={66}
          height={Math.min(13, suggestions.length + 2)}
          left={32}
          bottom={7}
        />
      )}
    </box>
  )
}
