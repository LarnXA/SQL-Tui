#!/usr/bin/env bun
import {
  readFileSync,
  existsSync,
  rmSync,
  readdirSync,
  statSync,
  mkdirSync,
  copyFileSync,
} from "node:fs"
import { join } from "node:path"
import { fileURLToPath } from "node:url"
import { spawnSync } from "node:child_process"
import { createCliRenderer } from "@opentui/core"
import { createRoot } from "@opentui/react"
import { App } from "./App"

const pkg = JSON.parse(
  readFileSync(new URL("../package.json", import.meta.url), "utf8"),
)

const argv = process.argv.slice(2)
if (argv.includes("--version") || argv.includes("-v")) {
  console.log(`SQL-TUI v${pkg.version}`)
  process.exit(0)
}

if (argv.includes("--update") || argv.includes("/update")) {
  await runUpdate()
  // 更新完成后，用新代码重新启动（去掉 --update 参数）
  const rest = process.argv
    .slice(1)
    .filter((a) => a !== "--update" && a !== "/update")
  const { status } = spawnSync(
    process.execPath,
    [fileURLToPath(import.meta.url), ...rest],
    { stdio: "inherit" },
  )
  process.exit(status ?? 0)
}

// exitOnCtrlC: false —— Ctrl+C 不再退出程序，改为在命令行内复制（/quit 退出）
const renderer = await createCliRenderer({ exitOnCtrlC: false })
createRoot(renderer).render(<App />)

// ===== 从 GitHub 更新到最新版 =====
const DEFAULT_REMOTE = "https://github.com/你的用户名/SQL-TUI.git"

async function runUpdate() {
  const root = fileURLToPath(new URL("..", import.meta.url))
  console.log(`正在从 GitHub 更新 SQL-TUI（仓库目录：${root}）...`)

  const gitDir = join(root, ".git")
  if (existsSync(gitDir)) {
    const r = spawnSync("git", ["-C", root, "pull", "origin", "main"], {
      stdio: "inherit",
    })
    if (r.exitCode !== 0) {
      console.error("git pull 失败，请检查网络连接或远程仓库。")
      process.exit(1)
    }
  } else {
    const remote = getRemoteUrl(root) ?? DEFAULT_REMOTE
    const tmp = join(root, "..", ".sql-tui-update-tmp")
    rmSync(tmp, { recursive: true, force: true })
    const r = spawnSync("git", ["clone", "--depth", "1", remote, tmp], {
      stdio: "inherit",
    })
    if (r.exitCode !== 0) {
      console.error("克隆失败，请检查网络或远程仓库地址。")
      process.exit(1)
    }
    copyDir(tmp, root)
    rmSync(tmp, { recursive: true, force: true })
  }

  const ir = spawnSync(process.execPath, ["install"], {
    cwd: root,
    stdio: "inherit",
  })
  if (ir.exitCode !== 0) {
    console.error("依赖安装失败，请手动运行 bun install。")
  }
  console.log("更新完成，正在重新启动…")
}

function getRemoteUrl(root: string): string | null {
  const r = spawnSync("git", ["-C", root, "remote", "get-url", "origin"], {
    encoding: "utf8",
  })
  const out = (r.stdout ?? "").trim()
  return out || null
}

function copyDir(src: string, dest: string) {
  for (const entry of readdirSync(src)) {
    // 排除依赖、git 元数据和本地连接配置（含密码）
    if (entry === "node_modules" || entry === ".git" || entry === "connections.json")
      continue
    const s = join(src, entry)
    const d = join(dest, entry)
    if (statSync(s).isDirectory()) {
      mkdirSync(d, { recursive: true })
      copyDir(s, d)
    } else {
      copyFileSync(s, d)
    }
  }
}
