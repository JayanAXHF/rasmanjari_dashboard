import fs from "node:fs"
import path from "node:path"
import Database from "better-sqlite3"

const databasePath = process.env.DATABASE_PATH
if (!databasePath) throw new Error("DATABASE_PATH must be set")
const migrationPath = new URL("../drizzle/0000_initial.sql", import.meta.url)

fs.mkdirSync(path.dirname(databasePath), { recursive: true })
const sqlite = new Database(databasePath)
sqlite.pragma("foreign_keys = ON")
sqlite.exec(fs.readFileSync(migrationPath, "utf8").replaceAll("--> statement-breakpoint", ""))
sqlite.close()

console.log(`Database ready: ${databasePath}`)
