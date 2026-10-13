export interface Connection {
  id: string
  name: string
  type: "mysql"
  host: string
  port: number
  user: string
  password: string
  database: string
}
