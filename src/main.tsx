#!/usr/bin/env bun
import { createCliRenderer } from "@opentui/core"
import { createRoot } from "@opentui/react"
import { App } from "./App"

// exitOnCtrlC: false —— Ctrl+C 不再退出程序，改为在命令行内复制（/quit 退出）
const renderer = await createCliRenderer({ exitOnCtrlC: false })
createRoot(renderer).render(<App />)
