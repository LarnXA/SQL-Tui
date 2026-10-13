import { readFileSync, writeFileSync } from "node:fs"
import { join } from "node:path"
import type { Connection } from "./types"

const FILE = join(import.meta.dir, "..", "connections.json")

export function loadConnections(): Connection[] {
  try {
    const data = JSON.parse(readFileSync(FILE, "utf8"))
    return Array.isArray(data) ? (data as Connection[]) : []
  } catch {
    return []
  }
}

function saveConnections(list: Connection[]) {
  writeFileSync(FILE, JSON.stringify(list, null, 2), "utf8")
}

export function addConnection(c: Connection) {
  const list = loadConnections()
  list.push(c)
  saveConnections(list)
}

export function updateConnection(id: string, patch: Partial<Connection>) {
  const list = loadConnections().map((x) => (x.id === id ? { ...x, ...patch } : x))
  saveConnections(list)
}

export function removeConnection(id: string) {
  saveConnections(loadConnections().filter((x) => x.id !== id))
}

export function genId(): string {
  return Math.random().toString(36).slice(2, 10)
}
