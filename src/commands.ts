export interface BaseCommand {
  name: string
  tpl: string
  zh: string
}

/** MySQL 基础命令（带中文注释），用于 "/" 补全与命令提示。 */
export const BASE_COMMANDS: BaseCommand[] = [
  { name: "USE", tpl: "USE <数据库名>", zh: "切换当前数据库" },
  { name: "SHOW DATABASES", tpl: "SHOW DATABASES", zh: "查看所有数据库" },
  { name: "SHOW TABLES", tpl: "SHOW TABLES", zh: "查看当前库的所有表" },
  { name: "SELECT", tpl: "SELECT * FROM <表名> LIMIT 100", zh: "查询表数据（可视化表格）" },
  { name: "INSERT", tpl: "INSERT INTO <表名> (列1, 列2) VALUES (值1, 值2)", zh: "增加一行数据" },
  { name: "UPDATE", tpl: "UPDATE <表名> SET 列=值 WHERE 条件", zh: "修改符合条件的行" },
  { name: "DELETE", tpl: "DELETE FROM <表名> WHERE 条件", zh: "删除符合条件的行" },
  { name: "ALTER ADD COLUMN", tpl: "ALTER TABLE <表名> ADD COLUMN <列名> <类型>", zh: "为表增加一列" },
  { name: "CREATE TABLE", tpl: "CREATE TABLE <表名> (id INT PRIMARY KEY, ...)", zh: "新建一张表" },
  { name: "DROP TABLE", tpl: "DROP TABLE <表名>", zh: "删除一张表" },
  { name: "DESCRIBE", tpl: "DESCRIBE <表名>", zh: "查看表结构（列与类型）" },
  { name: "CREATE DATABASE", tpl: "CREATE DATABASE <库名>", zh: "新建数据库" },
  { name: "DROP DATABASE", tpl: "DROP DATABASE <库名>", zh: "删除数据库" },
  { name: "TRUNCATE", tpl: "TRUNCATE TABLE <表名>", zh: "清空表数据" },
  { name: "RENAME TABLE", tpl: "RENAME TABLE <旧表> TO <新表>", zh: "重命名表" },
  { name: "EXPLAIN", tpl: "EXPLAIN SELECT ...", zh: "查看查询执行计划" },
]

export interface Suggestion {
  label: string
  insert: string
  zh?: string
}

/** 根据当前输入计算补全项：基础命令 + 当前库的表名。 */
export function computeSuggestions(
  cmd: string,
  tables: { name: string }[],
): Suggestion[] {
  const base: Suggestion[] = BASE_COMMANDS.map((c) => ({
    label: c.name,
    insert: c.tpl,
    zh: c.zh,
  }))
  for (const t of tables) {
    base.push({
      label: t.name,
      insert: `SELECT * FROM \`${t.name}\` LIMIT 100`,
      zh: "表",
    })
  }

  const trimmed = cmd.trim()
  const q = trimmed.startsWith("/") ? trimmed.replace(/^\//, "").trim() : (cmd.match(/[A-Za-z_]+$/)?.[0] ?? "")
  if (q === "") return base.slice(0, 12)
  const lower = q.toLowerCase()
  return base
    .filter(
      (s) =>
        s.label.toLowerCase().startsWith(lower) ||
        s.insert.toLowerCase().includes(lower),
    )
    .slice(0, 12)
}
