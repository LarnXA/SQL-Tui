/** 跨平台剪贴板读写（Windows / macOS / Linux）。失败时静默返回空。 */

export async function readClipboard(): Promise<string> {
  try {
    if (process.platform === "win32") {
      const proc = Bun.spawn(
        ["powershell", "-NoProfile", "-Command", "Get-Clipboard"],
        { stdout: "pipe", stderr: "ignore" },
      )
      const out = await new Response(proc.stdout).text()
      await proc.exited
      return out.replace(/\r?\n$/, "")
    }
    if (process.platform === "darwin") {
      const proc = Bun.spawn(["pbpaste"], { stdout: "pipe", stderr: "ignore" })
      const out = await new Response(proc.stdout).text()
      await proc.exited
      return out
    }
    const proc = Bun.spawn(
      ["xclip", "-selection", "clipboard", "-o"],
      { stdout: "pipe", stderr: "ignore" },
    )
    const out = await new Response(proc.stdout).text()
    await proc.exited
    return out
  } catch {
    return ""
  }
}

export async function writeClipboard(text: string): Promise<void> {
  if (!text) return
  try {
    if (process.platform === "win32") {
      const proc = Bun.spawn(["clip"], { stdin: "pipe", stderr: "ignore" })
      proc.stdin.write(text)
      await proc.stdin.end()
      await proc.exited
      return
    }
    if (process.platform === "darwin") {
      const proc = Bun.spawn(["pbcopy"], { stdin: "pipe", stderr: "ignore" })
      proc.stdin.write(text)
      await proc.stdin.end()
      await proc.exited
      return
    }
    const proc = Bun.spawn(
      ["xclip", "-selection", "clipboard"],
      { stdin: "pipe", stderr: "ignore" },
    )
    proc.stdin.write(text)
    await proc.stdin.end()
    await proc.exited
  } catch {
    // 忽略：无剪贴板工具时静默失败
  }
}
