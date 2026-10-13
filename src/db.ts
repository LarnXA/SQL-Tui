import mysql from "mysql2/promise"

export interface ConnConfig {
  host: string
  port: number
  user: string
  password: string
  database: string
}

export interface QueryResult {
  columns: string[]
  rows: any[][]
  affectedRows?: number
  message?: string
}

export type Pool = mysql.Pool

/** 建立连接池并验证连通性。 */
export async function connect(cfg: ConnConfig): Promise<Pool> {
  const pool = mysql.createPool({
    host: cfg.host,
    port: cfg.port,
    user: cfg.user,
    password: cfg.password,
    database: cfg.database,
    waitForConnections: true,
    connectionLimit: 5,
    namedPlaceholders: false,
  })
  const conn = await pool.getConnection()
  await conn.ping()
  conn.release()
  return pool
}

export async function listTables(pool: Pool, database: string): Promise<string[]> {
  const [rows] = await pool.query(
    `SELECT table_name AS name FROM information_schema.tables
     WHERE table_schema = ? AND table_type = 'BASE TABLE' ORDER BY table_name`,
    [database],
  )
  return (rows as any[]).map((r) => r.name as string)
}

export async function listColumns(
  pool: Pool,
  database: string,
  table: string,
): Promise<string[]> {
  const [rows] = await pool.query(
    `SELECT column_name AS name FROM information_schema.columns
     WHERE table_schema = ? AND table_name = ? ORDER BY ordinal_position`,
    [database, table],
  )
  return (rows as any[]).map((r) => r.name as string)
}

export async function rowCount(
  pool: Pool,
  database: string,
  table: string,
): Promise<number> {
  if (!database) return 0
  try {
    const [rows] = await pool.query(
      `SELECT COUNT(*) AS c FROM \`${database}\`.\`${table}\``,
    )
    return (rows as any[])[0]?.c ?? 0
  } catch {
    return 0
  }
}

/** 执行 SQL：只读语句自动加 LIMIT 防止刷屏；写操作直接执行。
 *  如果当前有选中的库且 SQL 没显式 USE，会先在该连接上执行 USE 当前库，
 *  避免连接池默认库为空时出现 "No database selected"。 */
export async function runQuery(
  pool: Pool,
  sql: string,
  currentDb = "",
  limit = 200,
): Promise<QueryResult> {
  const trimmed = sql.trim().replace(/;+\s*$/, "")
  if (!trimmed) throw new Error("空语句")
  let execSql = trimmed
  // SHOW TABLES 没指定库时，用当前选中的库补全，避免 No database selected
  if (currentDb) {
    const showTables = trimmed.match(
      /^show\s+tables(\s+like\s+['"][^'"]*['"])?\s*$/i,
    )
    if (showTables) {
      const like = showTables[1] ?? ""
      execSql = `SHOW TABLES FROM \`${currentDb}\`${like}`
    }
  }
  // 仅对 SELECT/WITH/VALUES 自动加 LIMIT；SHOW/DESCRIBE/EXPLAIN 等语法不同，不能追加。
  const isRead = /^(select|with|values)\b/i.test(execSql)
  if (isRead && !/\blimit\s+\d+/i.test(execSql)) {
    execSql = `${execSql} LIMIT ${limit}`
  }

  const conn = await pool.getConnection()
  try {
    // 显式切到当前选中的库，避免无默认库时报 No database selected
    if (
      currentDb &&
      !/^(use|set)\b/i.test(execSql) &&
      !/^(show\s+databases)\b/i.test(execSql)
    ) {
      await conn.query(`USE \`${currentDb}\``)
    }
    const [rows, fields] = await conn.query(execSql)
    // USE / INSERT / UPDATE / DELETE 等返回 OkPacket，不是数组
    if (!Array.isArray(rows)) {
      const ok = rows as any
      return {
        columns: [],
        rows: [],
        affectedRows: ok?.affectedRows ?? 0,
        message: ok?.info ?? "",
      }
    }
    const rowList = rows as any[]
    const columns = Array.isArray(fields)
      ? (fields as any[]).map((f) => f.name)
      : Object.keys(rowList[0] ?? {})
    const resultRows = rowList.map((r) => columns.map((c) => (r as any)[c]))
    return { columns, rows: resultRows }
  } finally {
    conn.release()
  }
}
